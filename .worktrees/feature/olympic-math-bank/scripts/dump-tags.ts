import { PrismaClient } from '@prisma/client';
import { knowledgeKeywords } from '../lib/ocr/knowledge-keywords';

const prisma = new PrismaClient({
  datasources: { db: { url: 'file:./lib/db/dev.db' } },
});

async function main() {
  const allTags = await prisma.knowledgeTag.findMany();
  const allNames = new Set(allTags.map(t => t.name));
  const kwKeys = Object.keys(knowledgeKeywords);

  const mismatches: Array<{kw: string, hints: string[]}> = [];

  for (const kw of kwKeys) {
    if (!allNames.has(kw)) {
      const fuzzy = allTags.filter(t => t.name.includes(kw) || kw.includes(t.name));
      mismatches.push({
        kw,
        hints: fuzzy.map(t => `L${t.level} "${t.name}"`)
      });
    }
  }

  console.log(`关键词库有但DB无: ${mismatches.length} 个\n`);

  for (const m of mismatches) {
    console.log(`❌ "${m.kw}"`);
    if (m.hints.length > 0) {
      console.log(`   候选: ${m.hints.join(' | ')}`);
    } else {
      console.log(`   候选: 无（概念在DB中不存在）`);
    }
  }

  prisma.$disconnect();
}

main().catch(e => { console.error(e); prisma.$disconnect(); });
