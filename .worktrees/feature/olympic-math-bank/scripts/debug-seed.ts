import * as XLSX from 'xlsx';

const EXCEL_PATH = 'C:/Users/Twilight/Desktop/拓展思维知识树_五级.xlsx';

function generateCode(module: string, topic: string | null, subtopic: string | null, knowledge: string | null, skill: string | null, level: number): string {
  const parts: string[] = [module];
  if (topic) parts.push(topic);
  if (subtopic) parts.push(subtopic);
  if (knowledge) parts.push(knowledge);
  if (skill) parts.push(skill);
  return parts.join('->');
}

// 读取Excel
const workbook = XLSX.readFile(EXCEL_PATH);
const sheetName = workbook.SheetNames[0];
const worksheet = workbook.Sheets[sheetName];
const data = XLSX.utils.sheet_to_json(worksheet) as any[];

console.log(`读取到 ${data.length} 行数据\n`);

// 查找包含"体育比赛"和"积分制"的行
const sportsRows = data.filter(row =>
  row['三级模块'] === '体育比赛' ||
  row['四级模块']?.includes('积分制')
);

console.log('体育比赛相关行:');
sportsRows.forEach((row, i) => {
  console.log(`\n[${i + 1}]`);
  console.log('  一级模块:', row['一级模块']);
  console.log('  二级模块:', row['二级模块']);
  console.log('  三级模块:', row['三级模块']);
  console.log('  四级模块:', row['四级模块']);
  console.log('  五级知识点:', row['五级知识点']);

  const module = row['一级模块'];
  const topic = row['二级模块'] || null;
  const subtopic = row['三级模块'] || null;
  const knowledge = row['四级模块'] || null;
  const skill = row['五级知识点'] || null;

  // 确定级别
  let level: number;
  if (skill) level = 5;
  else if (knowledge) level = 4;
  else if (subtopic) level = 3;
  else if (topic) level = 2;
  else level = 1;

  const code = generateCode(module, topic, subtopic, knowledge, skill, level);
  console.log(`  level: ${level}, code: "${code}"`);

  // 计算父节点code
  if (level > 1) {
    const parentCode = generateCode(
      module,
      level > 2 ? topic : null,
      level > 3 ? subtopic : null,
      level > 4 ? knowledge : null,
      null,
      level - 1
    );
    console.log(`  parentCode: "${parentCode}"`);
  }
});

// 检查是否有重复code
console.log('\n\n检查code重复情况:');
const codeMap = new Map<string, number>();
sportsRows.forEach(row => {
  const module = row['一级模块'];
  const topic = row['二级模块'] || null;
  const subtopic = row['三级模块'] || null;
  const knowledge = row['四级模块'] || null;
  const skill = row['五级知识点'] || null;

  let level: number;
  if (skill) level = 5;
  else if (knowledge) level = 4;
  else if (subtopic) level = 3;
  else if (topic) level = 2;
  else level = 1;

  const code = generateCode(module, topic, subtopic, knowledge, skill, level);
  codeMap.set(code, (codeMap.get(code) || 0) + 1);
});

codeMap.forEach((count, code) => {
  if (count > 1) {
    console.log(`  重复code: "${code}" 出现 ${count} 次`);
  }
});
