/**
 * LaTeX 快捷宏定义 — 从教研云 MathJax 配置中提取的 KaTeX 兼容宏。
 * 用户在编辑器中输入 \R 即得 \mathbb{R}，大幅提升输入效率。
 *
 * 教研云原始配置含 300+ 宏，此处仅提取 KaTeX 原生支持的子集。
 * MathJax 专有宏（如 \unicodeInt、自定义 SVG 处理）已排除。
 */

export const LATEX_MACROS: Record<string, string> = {
  // === 数集 ===
  R: '\\mathbb{R}',
  N: '\\mathbb{N}',
  Z: '\\mathbb{Z}',
  C: '\\mathbb{C}',
  Q: '\\mathbb{Q}',
  H: '\\mathbb{H}',
  reals: '\\mathbb{R}',
  Reals: '\\mathbb{R}',
  cnums: '\\mathbb{C}',
  Complex: '\\mathbb{C}',
  natnums: '\\mathbb{N}',

  // === 希腊字母大写简写 ===
  Alpha: '\\mathrm{A}',
  Beta: '\\mathrm{B}',
  Chi: '\\mathrm{X}',
  Epsilon: '\\mathrm{E}',
  Eta: '\\mathrm{H}',
  Iota: '\\mathrm{I}',
  Kappa: '\\mathrm{K}',
  Mu: '\\mathrm{M}',
  Nu: '\\mathrm{N}',
  Omicron: '\\mathrm{O}',
  Rho: '\\mathrm{P}',
  Tau: '\\mathrm{T}',
  Zeta: '\\mathrm{Z}',

  // === 运算符/关系符 ===
  and: '\\land',
  or: '\\lor',
  isin: '\\in',
  exist: '\\exists',
  empty: '\\emptyset',
  O: '\\emptyset',
  infin: '\\infty',
  part: '\\partial',
  real: '\\Re',
  image: '\\Im',
  plusmn: '\\pm',
  sdot: '\\cdot',
  bull: '\\bullet',
  ang: '\\angle',
  bold: '\\mathbf',
  alef: '\\aleph',
  alefsym: '\\aleph',
  weierp: '\\wp',

  // === 箭头 ===
  larr: '\\leftarrow',
  rarr: '\\rightarrow',
  Larr: '\\Leftarrow',
  Rarr: '\\Rightarrow',
  lArr: '\\Leftarrow',
  rArr: '\\Rightarrow',
  harr: '\\leftrightarrow',
  Harr: '\\Leftrightarrow',
  hAar: '\\Leftrightarrow',
  lrarr: '\\leftrightarrow',
  Lrarr: '\\Leftrightarrow',
  lrArr: '\\Leftrightarrow',
  darr: '\\downarrow',
  uarr: '\\uparrow',
  dArr: '\\Downarrow',
  uArr: '\\Uparrow',
  Darr: '\\Downarrow',
  Uarr: '\\Uparrow',

  // === 括号/分隔符 ===
  lang: '\\langle',
  rang: '\\rangle',

  // === 集合关系 ===
  sub: '\\subset',
  sube: '\\subseteq',
  supe: '\\supseteq',

  // === 特殊符号 ===
  sect: '\\S',
  P: '\\P',
  clubs: '\\clubsuit',
  diamonds: '\\diamondsuit',
  hearts: '\\heartsuit',
  spades: '\\spadesuit',
  thetasym: '\\vartheta',
  euro: '\\u20AC',
  geneuro: '\\u20AC',
  geneuronarrow: '\\u20AC',
  geneurowide: '\\u20AC',
  officialeuro: '\\u20AC',
  AA: '\\u00C5',
  Dagger: '\\ddagger',
  textvisiblespace: '\\textvisiblespace',

  // === 积分 ===
  oint: '\\oint',
  oiint: '\\oiint',
  oiiint: '\\oiiint',

  // === 希腊字母特殊变体 ===
  coppa: '\\unicode{x03D9}',
  Coppa: '\\unicode{x03D8}',
  koppa: '\\unicode{x03DF}',
  Koppa: '\\unicode{x03DE}',
  stigma: '\\unicode{x03DB}',
  Stigma: '\\unicode{x03DA}',
  sampi: '\\unicode{x03E1}',
  Sampi: '\\unicode{x03E0}',
  Digamma: '\\unicode{x03DC}',
  varcoppa: '\\unicode{x03D9}',
  varstigma: '\\unicode{x03DB}',
};

/**
 * 将宏定义转换为 KaTeX renderToString 可用的 macros 参数格式。
 * KaTeX 的 macros 需要值是展开后的完整 LaTeX 字符串。
 */
export function getKaTeXMacros(): Record<string, string> {
  return { ...LATEX_MACROS };
}
