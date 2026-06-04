import { PrismaClient } from '@prisma/client';
import { knowledgeKeywords } from '../lib/ocr/knowledge-keywords';

const p = new PrismaClient({ datasources: { db: { url: 'file:./lib/db/dev.db' } } });

async function main() {
  const allTags = await p.knowledgeTag.findMany({
    include: {
      parent: { include: { parent: { include: { parent: { include: { parent: true } } } } } }
    }
  });

  const text = '计算：1/2 + 1/3 + 1/6 = ____。 1 通分：3/6+2/6+1/6=6/6=1';

  function getParents(t: any) { const ns: string[] = []; let c = t.parent; while (c) { ns.push(c.name); c = c.parent; } return ns; }

  const tag = allTags.find(t => t.name === '分数加减');
  console.log('Tag:', tag?.name, 'level:', tag?.level);
  console.log('Parents:', getParents(tag));
  const kws = knowledgeKeywords['分数加减'] || [];
  console.log('Explicit:', kws);
  if (!tag) {
    console.log('Tag not found!');
    return;
  }
  const all = [...new Set([tag.name, ...getParents(tag), ...kws])];
  console.log('All keywords:', all);

  let score = 0;
  for (const k of all) {
    const kl = k.toLowerCase();
    if (text.includes(kl)) { score += 1; console.log('  +1 includes:', k); }
    const esc = kl.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    if (/[\u4e00-\u9fff\u3400-\u4dbf]/.test(kl)) {
      const r = new RegExp(`(?:^|\\s|[，。！？；：""''（）【】《》\\-])${esc}(?:$|\\s|[，。！？；：""''（）【】《》\\-])`, 'i');
      try {
        if (r.test(text)) { score += 2; console.log('  +2 exact:', k); }
        else { console.log('  ~no exact:', k); }
      } catch(e) { console.log('  err:', e); }
    }
  }
  console.log('Score:', score);

  // Also check '通分' specifically
  console.log('\nDirect check:');
  console.log('text.includes("通分"):', text.includes('通分'));
  const r2 = new RegExp(`(?:^|\\s|[，。！？；：""''（）【】《》\\-])通分(?:$|\\s|[，。！？；：""''（）【】《》\\-])`, 'i');
  console.log('regex test:', r2.test(text));
  console.log('regex:', r2);

  p.$disconnect();
}
main().catch(e => { console.error(e); p.$disconnect(); });
