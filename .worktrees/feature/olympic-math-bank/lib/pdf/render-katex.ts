import katex from 'katex';
import * as cheerio from 'cheerio';

export interface ContentSegment {
  type: 'text' | 'inline-formula' | 'block-formula' | 'image';
  content: string;
  src?: string;
  dataUri?: string;
  width?: number;
  height?: number;
}

interface CharFragment {
  kind: 'char';
  text: string;
  x: number;
  y: number;
  fontSize: number;
  italic: boolean;
  bold: boolean;
}

interface LineFragment {
  kind: 'line';
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  strokeWidth: number;
}

type Fragment = CharFragment | LineFragment;

const CHAR_WIDTH_MAP: Record<string, number> = {
  'i': 0.30, 'l': 0.30, 'I': 0.36, '|': 0.30, '!': 0.36,
  'j': 0.33, 'f': 0.37, 't': 0.37, 'r': 0.42, 'J': 0.45,
  'a': 0.50, 'c': 0.47, 'e': 0.47, 'g': 0.50, 'k': 0.50,
  'n': 0.52, 'o': 0.52, 'p': 0.52, 'q': 0.52, 's': 0.44,
  'u': 0.52, 'v': 0.50, 'x': 0.50, 'y': 0.50, 'z': 0.47,
  'b': 0.52, 'd': 0.52, 'h': 0.52,
  'm': 0.80, 'w': 0.75, 'M': 0.85, 'W': 0.88,
  'A': 0.70, 'B': 0.67, 'C': 0.70, 'D': 0.72, 'E': 0.64,
  'F': 0.60, 'G': 0.73, 'H': 0.72, 'K': 0.67, 'L': 0.60,
  'N': 0.75, 'O': 0.75, 'P': 0.64, 'Q': 0.75, 'R': 0.70,
  'S': 0.60, 'T': 0.64, 'U': 0.72, 'V': 0.67, 'X': 0.70,
  'Y': 0.67, 'Z': 0.64,
  '0': 0.52, '1': 0.52, '2': 0.52, '3': 0.52, '4': 0.52,
  '5': 0.52, '6': 0.52, '7': 0.52, '8': 0.52, '9': 0.52,
  ',': 0.30, '.': 0.30, ':': 0.30, ';': 0.30,
  '+': 0.57, '−': 0.57, '=': 0.57, '<': 0.57, '>': 0.57,
  '(': 0.40, ')': 0.40, '[': 0.40, ']': 0.40,
  '{': 0.42, '}': 0.42, '/': 0.47, '\\': 0.47,
  '*': 0.52, '⋅': 0.52, '×': 0.57, '÷': 0.57,
  ' ': 0.28,
  '\u00B1': 0.57,
  '\u2264': 0.57, '\u2265': 0.57, '\u2260': 0.57,
  '\u2248': 0.60, '\u2261': 0.60,
  '\u2208': 0.52, '\u2209': 0.52, '\u2282': 0.52,
  '\u221E': 0.75,
  '\u03B1': 0.52, '\u03B2': 0.52, '\u03B3': 0.47, '\u03B4': 0.52, '\u03B5': 0.44,
  '\u03B6': 0.44, '\u03B7': 0.52, '\u03B8': 0.52, '\u03C0': 0.55, '\u03C3': 0.50,
  '\u03C4': 0.44, '\u03C6': 0.54, '\u03C9': 0.58,
  '\u0394': 0.68, '\u0393': 0.60, '\u0398': 0.72, '\u039B': 0.68,
  '\u039E': 0.64, '\u03A0': 0.72, '\u03A3': 0.68, '\u03A6': 0.70,
  '\u03A8': 0.70, '\u03A9': 0.72,
  '\u2200': 0.64, '\u2203': 0.52, '\u2204': 0.52,
  '\u2220': 0.64, '\u25B3': 0.60,
  '\u2192': 0.70, '\u2190': 0.70, '\u2194': 0.75,
  '\u21D2': 0.70, '\u21D0': 0.70, '\u21D4': 0.75,
  '\u2191': 0.45, '\u2193': 0.45,
  '\u22A5': 0.55, '\u2225': 0.55,
  '\u2207': 0.64,
};

function getCharWidth(ch: string): number {
  if (ch.trim() === '') return 0.28;
  return CHAR_WIDTH_MAP[ch] ?? 0.55;
}

function getFragmentWidth(f: Fragment): number {
  if (f.kind === 'line') return Math.max(f.x1, f.x2);
  return f.x + f.fontSize * getCharWidth(f.text);
}

function fragmentMaxX(f: Fragment): number {
  if (f.kind === 'line') return Math.max(f.x1, f.x2);
  return f.x + f.fontSize * getCharWidth(f.text) * 1.1;
}

function shiftFragment(f: Fragment, dx: number, dy: number): void {
  if (f.kind === 'line') {
    f.x1 += dx; f.x2 += dx;
    f.y1 += dy; f.y2 += dy;
  } else {
    f.x += dx; f.y += dy;
  }
}

export function parseContentToSegments(text: string): ContentSegment[] {
  const segments: ContentSegment[] = [];
  let remaining = text;

  const formulaPattern = /(\$\$[\s\S]*?\$\$|\$[^$\n]+?\$|\\\[[\s\S]*?\\\]|\\\([\s\S]*?\\\))/g;
  const imagePattern = /!\[([^\]]*)\]\(([^)\s]+)(?:\s+(?:=([0-9]+)x([0-9]+)=|"([^"]+)")?)?\)|<img[^>]+src=["']([^"']+)["'][^>]*>/gi;

  let lastIndex = 0;

  while (lastIndex < remaining.length) {
    const formulaMatch = formulaPattern.exec(remaining);
    formulaPattern.lastIndex = lastIndex;
    const nextFormulaIdx = formulaMatch ? formulaMatch.index : -1;

    if (nextFormulaIdx >= 0 && nextFormulaIdx === lastIndex) {
      const match = formulaPattern.exec(remaining)!;
      const isBlock = match[1].startsWith('\\[');
      segments.push({
        type: isBlock ? 'block-formula' : 'inline-formula',
        content: match[1].replace(/^\$\$|\$\$$|^\\\[|\\\]$|^\\\(|\\\)$/g, '').replace(/^\$|\$$/, ''),
      });
      lastIndex = match.index + match[0].length;
      formulaPattern.lastIndex = lastIndex;
      continue;
    }

    const imgMatch = imagePattern.exec(remaining);
    imagePattern.lastIndex = lastIndex;
    const nextImgIdx = imgMatch ? imgMatch.index : -1;

    if (nextImgIdx >= 0 && nextImgIdx === lastIndex) {
      const match = imagePattern.exec(remaining)!;
      if (match[0].startsWith('![')) {
        segments.push({
          type: 'image',
          content: match[0],
          src: match[2],
          width: match[3] ? parseInt(match[3], 10) : undefined,
          height: match[4] ? parseInt(match[4], 10) : undefined,
        });
      } else {
        const srcMatch = match[0].match(/src=["']([^"']+)["']/);
        segments.push({
          type: 'image',
          content: match[0],
          src: srcMatch ? srcMatch[1] : '',
        });
      }
      lastIndex = match.index + match[0].length;
      imagePattern.lastIndex = lastIndex;
      continue;
    }

    const nextSpecial = [nextFormulaIdx, nextImgIdx].filter(i => i >= 0).sort((a, b) => a - b)[0];

    if (nextSpecial < 0) {
      const tail = remaining.substring(lastIndex).trim();
      if (tail) {
        segments.push({ type: 'text', content: tail });
      }
      break;
    }

    const textBefore = remaining.substring(lastIndex, nextSpecial);
    if (textBefore) {
      segments.push({ type: 'text', content: textBefore });
    }
    lastIndex = nextSpecial;
  }

  return segments;
}

function isMathVariable($el: cheerio.Cheerio<any>): boolean {
  const classes = ($el.attr('class') || '').split(/\s+/);
  if (classes.includes('mathnormal')) return true;
  if (classes.includes('mathit')) return true;
  const parent = $el.parent();
  if (parent.length && parent.attr('class')?.includes('mathnormal')) return true;
  return false;
}

function getDirectText($el: cheerio.Cheerio<any>): string {
  const clone = $el.clone();
  clone.find('*').remove();
  let text = '';
  clone.each((_, node) => {
    if (node.type === 'text') {
      text += cheerio.load('<div></div>')('div').text((node as any).data || '').html() || '';
    }
  });
  return text;
}

const LARGE_OP_SCALE = 1.5;
const DELIM_SIZE_SCALE: Record<string, number> = {
  'size1': 1.2, 'size2': 1.6, 'size3': 2.0, 'size4': 2.4,
};

function walkKaTeXNode(
  $: cheerio.CheerioAPI,
  $el: cheerio.Cheerio<any>,
  baseFontSize: number,
  baseY: number,
): Fragment[] {
  const fragments: Fragment[] = [];
  if (!$el.length) return fragments;

  let currentX = 0;

  for (const child of $el.contents().toArray()) {
    const $child = $(child);

    if (child.type === 'text') {
      const text = (child as any).data || '';
      for (const ch of text) {
        const w = getCharWidth(ch);
        fragments.push({
          kind: 'char',
          text: ch,
          x: currentX,
          y: baseY,
          fontSize: baseFontSize,
          italic: false,
          bold: false,
        });
        currentX += baseFontSize * w;
      }
      continue;
    }

    if (child.type !== 'tag') continue;

    const tagName = (child as any).tagName?.toLowerCase();
    const classes = ($child.attr('class') || '').split(/\s+/);
    const style = $child.attr('style') || '';

    if (tagName === 'span' && classes.includes('mspace')) continue;
    if (tagName === 'span' && classes.includes('pstrut')) continue;
    if (tagName === 'span' && classes.includes('sizing')) continue;

    if (tagName === 'span' && classes.includes('frac-line')) {
      const borderMatch = style.match(/border-bottom-width:\s*([\d.]+)em/);
      const sw = (borderMatch ? parseFloat(borderMatch[1]) : 0.04) * baseFontSize * 3;
      fragments.push({
        kind: 'line',
        x1: currentX,
        y1: baseY,
        x2: currentX + baseFontSize * 2,
        y2: baseY,
        strokeWidth: sw,
      });
      continue;
    }

    const isMrow = tagName === 'span' && classes.includes('mord');
    const isMbin = tagName === 'span' && classes.includes('mbin');
    const isMrel = tagName === 'span' && classes.includes('mrel');
    const isMopen = tagName === 'span' && classes.includes('mopen');
    const isMclose = tagName === 'span' && classes.includes('mclose');
    const isMop = tagName === 'span' && classes.includes('mop');
    const isLargeOp = isMop && classes.includes('op-symbol') && classes.includes('large-op');
    const isMtight = classes.includes('mtight');

    const delimSizeClass = classes.find(c => Object.keys(DELIM_SIZE_SCALE).includes(c));

    const topMatch = style.match(/top:\s*(-?[\d.]+)em/);
    const bottomMatch = style.match(/bottom:\s*(-?[\d.]+)em/);
    let y = baseY;

    if (topMatch) {
      y += parseFloat(topMatch[1]) * baseFontSize;
    }
    if (bottomMatch) {
      y += parseFloat(bottomMatch[1]) * baseFontSize;
    }

    let fontSize = isMtight ? baseFontSize * 0.7 : baseFontSize;
    if (isLargeOp) fontSize = baseFontSize * LARGE_OP_SCALE;
    if (delimSizeClass) fontSize = baseFontSize * (DELIM_SIZE_SCALE[delimSizeClass] || 1);

    if (tagName === 'span' && classes.includes('strut')) continue;

    if (tagName === 'span' && (classes.includes('vlist') || classes.includes('vlist-t') || classes.includes('vlist-r'))) {
      const childResults = walkKaTeXNode($, $child, fontSize, y);
      for (const f of childResults) shiftFragment(f, currentX, 0);
      fragments.push(...childResults);
      if (childResults.length > 0) {
        const maxChildX = Math.max(...childResults.map(fragmentMaxX));
        if (maxChildX > currentX) currentX = maxChildX;
      }
      continue;
    }

    if (tagName === 'span' && classes.includes('msupsub')) {
      const supSize = fontSize * 0.7;
      let supY = y;
      let subY = y;

      $child.find('> span').each((_, wrapper) => {
        const $w = $(wrapper);
        const wStyle = $w.attr('style') || '';
        const wTopMatch = wStyle.match(/top:\s*(-?[\d.]+)em/);
        const wBottomMatch = wStyle.match(/bottom:\s*(-?[\d.]+)em/);

        if (wTopMatch && parseFloat(wTopMatch[1]) < 0) {
          supY = y + parseFloat(wTopMatch[1]) * baseFontSize;
        }
        if (wBottomMatch && parseFloat(wBottomMatch[1]) < 0) {
          subY = y + parseFloat(wBottomMatch[1]) * baseFontSize;
        }
      });

      let baseX = currentX;
      let supFrags: Fragment[] = [];
      let subFrags: Fragment[] = [];
      let baseFrags: Fragment[] = [];

      for (const innerChild of $child.contents().toArray()) {
        const $ic = $(innerChild);
        if (innerChild.type !== 'tag') continue;
        const icStyle = $ic.attr('style') || '';
        const icTopMatch = icStyle.match(/top:\s*(-?[\d.]+)em/);
        const icBottomMatch = icStyle.match(/bottom:\s*(-?[\d.]+)em/);

        if (icTopMatch && parseFloat(icTopMatch[1]) < 0) {
          supFrags = walkKaTeXNode($, $ic, supSize, supY);
          for (const f of supFrags) {
            if (f.kind === 'char') { f.fontSize = supSize; f.y = supY; }
            shiftFragment(f, 0, supY - y);
          }
        } else if (icBottomMatch && parseFloat(icBottomMatch[1]) < 0) {
          subFrags = walkKaTeXNode($, $ic, supSize, subY);
          for (const f of subFrags) {
            if (f.kind === 'char') { f.fontSize = supSize; f.y = subY; }
            shiftFragment(f, 0, subY - y);
          }
        } else {
          baseFrags = walkKaTeXNode($, $ic, fontSize, y);
        }
      }

      for (const f of baseFrags) shiftFragment(f, currentX, 0);
      fragments.push(...baseFrags);
      if (baseFrags.length > 0) {
        const maxBaseX = Math.max(...baseFrags.map(fragmentMaxX));
        if (maxBaseX > currentX) currentX = maxBaseX;
      }

      for (const f of supFrags) shiftFragment(f, currentX - baseX, 0);
      fragments.push(...supFrags);

      for (const f of subFrags) shiftFragment(f, currentX - baseX, 0);
      fragments.push(...subFrags);

      continue;
    }

    if (tagName === 'span' && classes.includes('mfrac')) {
      const lineSpan = $child.find('.frac-line').first();
      const lineStyle = lineSpan.attr('style') || '';
      const borderMatch = lineStyle.match(/border-bottom-width:\s*([\d.]+)em/);
      const sw = (borderMatch ? parseFloat(borderMatch[1]) : 0.04) * baseFontSize * 3;

      const $vlistT = $child.find('.vlist-t2').first() || $child.find('.vlist').first();
      const numSpanSel = '.mfrac > .vlist > .vlist-r > .vlist > span:first-child';
      const denSpanSel = '.mfrac > .vlist > .vlist-r > .vlist > span:last-child';

      let numFrags: Fragment[] = [];
      let denFrags: Fragment[] = [];
      let lineY = y - baseFontSize * 1.0;
      let numY = y - baseFontSize * 0.4;
      let denY = y - baseFontSize * 1.3;

      if ($vlistT.length && $vlistT.children().first().length) {
        const $innerVlist = $vlistT.children().first().children().first();
        if ($innerVlist.length) {
          const $rows = $innerVlist.children();
          for (let ri = 0; ri < $rows.length; ri++) {
            const $row = $($rows[ri]);
            const rowStyle = $row.attr('style') || '';
            const rowTopMatch = rowStyle.match(/top:\s*(-?[\d.]+)em/);
            if (!rowTopMatch) continue;

            const rowTop = parseFloat(rowTopMatch[1]);
            const rowAbsY = y + rowTop * baseFontSize;
            const $content = $row.find('.mord').first() || $row.find('.mtight').first() || $row;

            const hasFracLine = $row.find('.frac-line').length > 0;
            const hasMtight = $row.find('.mtight').length > 0;

            if (hasFracLine) {
              lineY = rowAbsY;
            } else if (Math.abs(rowTop) < 2.8) {
              numY = rowAbsY;
              numFrags = walkKaTeXNode($, $content, baseFontSize * 0.9, numY);
            } else {
              denY = rowAbsY;
              if (hasMtight) {
                denFrags = walkKaTeXNode($, $content, baseFontSize * 0.72, denY);
              } else {
                denFrags = walkKaTeXNode($, $content, baseFontSize * 0.9, denY);
              }
            }
          }
        }
      }

      if (numFrags.length === 0 && denFrags.length === 0) {
        const childFrags = walkKaTeXNode($, $child, fontSize * 0.9, y);
        for (const f of childFrags) shiftFragment(f, currentX, 0);
        fragments.push(...childFrags);
        if (childFrags.length > 0) {
          const mc = Math.max(...childFrags.map(fragmentMaxX));
          if (mc > currentX) currentX = mc;
        }
        continue;
      }

      const numWidth = numFrags.length > 0 ? Math.max(...numFrags.map(fragmentMaxX)) : 0;
      const denWidth = denFrags.length > 0 ? Math.max(...denFrags.map(fragmentMaxX)) : 0;
      const fracWidth = Math.max(numWidth, denWidth) + baseFontSize * 0.4;

      const numCenterOffset = (fracWidth - numWidth) / 2;
      const denCenterOffset = (fracWidth - denWidth) / 2;

      for (const f of numFrags) shiftFragment(f, currentX + numCenterOffset, 0);
      fragments.push(...numFrags);

      fragments.push({
        kind: 'line',
        x1: currentX,
        y1: lineY,
        x2: currentX + fracWidth,
        y2: lineY,
        strokeWidth: sw > 0 ? sw : baseFontSize * 0.06,
      });

      for (const f of denFrags) shiftFragment(f, currentX + denCenterOffset, 0);
      fragments.push(...denFrags);

      currentX += fracWidth;
      continue;
    }

    if (tagName === 'span' && classes.includes('sqrt')) {
      const sqrtFrags = walkKaTeXNode($, $child, fontSize, y);
      const sqrtContentWidth = sqrtFrags.length > 0
        ? Math.max(...sqrtFrags.map(fragmentMaxX)) + fontSize * 0.3
        : fontSize * 0.6;

      for (const f of sqrtFrags) shiftFragment(f, currentX + fontSize * 0.85, 0);

      fragments.push({
        kind: 'char',
        text: '\u221A',
        x: currentX,
        y: y - fontSize * 0.05,
        fontSize: fontSize * 1.25,
        italic: false,
        bold: false,
      });

      fragments.push({
        kind: 'line',
        x1: currentX + fontSize * 0.6,
        y1: y - fontSize * 0.8,
        x2: currentX + fontSize * 0.85 + sqrtContentWidth,
        y2: y - fontSize * 0.8,
        strokeWidth: fontSize * 0.055,
      });

      fragments.push(...sqrtFrags);
      currentX += fontSize * 0.85 + sqrtContentWidth;
      continue;
    }

    if (tagName === 'span' && classes.includes('accent')) {
      const accentText = getDirectText($child) || '\u0302';
      fragments.push({
        kind: 'char',
        text: accentText,
        x: currentX,
        y: y - fontSize * 0.5,
        fontSize: fontSize * 0.8,
        italic: false,
        bold: false,
      });
      const accentW = fontSize * 0.8 * getCharWidth(accentText);
      if (accentW > 0) currentX += accentW;
      continue;
    }

    const childFrags = walkKaTeXNode($, $child, fontSize, y);

    if (isMbin || isMrel) {
      const pad = baseFontSize * 0.15;
      for (const f of childFrags) shiftFragment(f, currentX + pad, 0);
      fragments.push(...childFrags);
      if (childFrags.length > 0) {
        const mc = Math.max(...childFrags.map(fragmentMaxX)) + pad * 2;
        if (mc > currentX) currentX = mc;
        else currentX += pad * 2;
      } else {
        currentX += pad * 2;
      }
      continue;
    }

    if (tagName === 'span' && (classes.includes('mathnormal') || classes.includes('mathit'))) {
      for (const f of childFrags) {
        if (f.kind === 'char') {
          f.italic = true;
        }
      }
    }

    if (tagName === 'span' && classes.includes('mathbf')) {
      for (const f of childFrags) {
        if (f.kind === 'char') {
          f.bold = true;
        }
      }
    }

    for (const f of childFrags) shiftFragment(f, currentX, 0);
    fragments.push(...childFrags);

    if (childFrags.length > 0) {
      const maxChildX = Math.max(...childFrags.map(fragmentMaxX));
      if (maxChildX > currentX) currentX = maxChildX;
    }
  }

  return fragments;
}

export function formulaToSvgDataUri(latex: string, displayMode: boolean): { dataUri: string; width: number; height: number } {
  const baseFontSize = displayMode ? 16 : 12;
  const lineHeight = baseFontSize * 1.6;

  try {
    const html = katex.renderToString(latex, {
      displayMode,
      throwOnError: false,
      output: 'html',
      strict: false,
      trust: true,
    });

    const $ = cheerio.load(html);
    const $root = $('.katex-html');

    if (!$root.length) {
      const width = latex.length * baseFontSize * 0.6;
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${lineHeight}">
  <text x="0" y="${baseFontSize}" font-family="Times-Italic" font-size="${baseFontSize}px">${escapeXml(latex)}</text>
</svg>`;
      return { dataUri: svgToDataUri(svg), width, height: lineHeight };
    }

    const fragments = walkKaTeXNode($, $root, baseFontSize, baseFontSize);

    if (fragments.length === 0) {
      const width = latex.length * baseFontSize * 0.6;
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${lineHeight}">
  <text x="0" y="${baseFontSize}" font-family="Times-Italic" font-size="${baseFontSize}px">${escapeXml(latex)}</text>
</svg>`;
      return { dataUri: svgToDataUri(svg), width, height: lineHeight };
    }

    const maxX = Math.max(...fragments.map(fragmentMaxX));
    const minY = Math.min(...fragments.map(f => {
      if (f.kind === 'line') return Math.min(f.y1, f.y2) - 2;
      return f.y - f.fontSize;
    }));
    const maxY = Math.max(...fragments.map(f => {
      if (f.kind === 'line') return Math.max(f.y1, f.y2) + 2;
      return f.y + f.fontSize * 0.4;
    }));
    const totalWidth = Math.max(Math.ceil(maxX + 4), 20);
    const totalHeight = Math.max(Math.ceil(maxY - minY + 6), lineHeight);

    const padX = 2;
    const padY = 2 - minY;

    const svgLines: string[] = [];
    svgLines.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${totalWidth}" height="${totalHeight}">`);
    svgLines.push(`<rect width="100%" height="100%" fill="white"/>`);

    const normalStyle = 'font-family="Helvetica"';
    const italicStyle = 'font-family="Times-Italic"';
    const boldNormalStyle = 'font-family="Helvetica" font-weight="bold"';
    const boldItalicStyle = 'font-family="Times-Italic" font-weight="bold"';

    for (const f of fragments) {
      if (f.kind === 'line') {
        svgLines.push(
          `<line x1="${(f.x1 + padX).toFixed(1)}" y1="${(f.y1 + padY).toFixed(1)}" x2="${(f.x2 + padX).toFixed(1)}" y2="${(f.y2 + padY).toFixed(1)}" stroke="black" stroke-width="${f.strokeWidth.toFixed(1)}"/>`
        );
      } else {
        let style: string;
        if (f.bold && f.italic) style = boldItalicStyle;
        else if (f.bold) style = boldNormalStyle;
        else if (f.italic) style = italicStyle;
        else style = normalStyle;

        svgLines.push(
          `<text x="${(f.x + padX).toFixed(1)}" y="${(f.y + padY).toFixed(1)}" ${style} font-size="${f.fontSize.toFixed(1)}px">${escapeXml(f.text)}</text>`
        );
      }
    }

    svgLines.push('</svg>');
    const svg = svgLines.join('\n');

    return {
      dataUri: svgToDataUri(svg),
      width: totalWidth,
      height: totalHeight,
    };
  } catch {
    const width = latex.length * baseFontSize * 0.6;
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${lineHeight}">
  <text x="0" y="${baseFontSize}" font-family="Times-Italic" font-size="${baseFontSize}px">${escapeXml(latex)}</text>
</svg>`;
    return { dataUri: svgToDataUri(svg), width, height: lineHeight };
  }
}

function svgToDataUri(svg: string): string {
  const base64 = Buffer.from(svg).toString('base64');
  return `data:image/svg+xml;base64,${base64}`;
}

function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}
