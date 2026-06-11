import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import path from 'path';

const dbPath = path.resolve(__dirname, 'dev.db');
const prisma = new PrismaClient({
  datasources: {
    db: {
      url: `file:${dbPath}`,
    },
  },
});

async function main() {
  // 创建默认管理员用户
  const adminPassword = await bcrypt.hash('2000331', 10);
  const admin = await prisma.user.upsert({
    where: { phone: '13704592025' },
    update: { password: adminPassword },
    create: {
      phone: '13704592025',
      name: '管理员',
      role: 'ADMIN',
      password: adminPassword,
    },
  });
  console.log('Created admin user:', admin.phone);

  // 测试教研员（稍后配置）
  const editorPassword = await bcrypt.hash('editor123', 10);
  const editor = await prisma.user.upsert({
    where: { phone: 'editor_placeholder' },
    update: { password: editorPassword },
    create: {
      phone: 'editor_placeholder',
      name: '测试教研员',
      role: 'EDITOR',
      password: editorPassword,
    },
  });
  console.log('Created editor user:', editor.phone);

  // 测试审核员（稍后配置）
  const reviewerPassword = await bcrypt.hash('reviewer123', 10);
  const reviewer = await prisma.user.upsert({
    where: { phone: 'reviewer_placeholder' },
    update: { password: reviewerPassword },
    create: {
      phone: 'reviewer_placeholder',
      name: '测试审核员',
      role: 'REVIEWER',
      password: reviewerPassword,
    },
  });
  console.log('Created reviewer user:', reviewer.phone);

  // 基础标签数据
  const gradeTags = [
    { name: '一年级', type: 'GRADE' as const, description: '小学一年级' },
    { name: '二年级', type: 'GRADE' as const, description: '小学二年级' },
    { name: '三年级', type: 'GRADE' as const, description: '小学三年级' },
    { name: '四年级', type: 'GRADE' as const, description: '小学四年级' },
    { name: '五年级', type: 'GRADE' as const, description: '小学五年级' },
    { name: '六年级', type: 'GRADE' as const, description: '小学六年级' },
  ];

  for (const tag of gradeTags) {
    await prisma.tag.upsert({
      where: { name: tag.name },
      update: {},
      create: tag,
    });
  }
  console.log('Created grade tags');

  // 难度标签
  const difficultyTags = [
    { name: '1星', type: 'DIFFICULTY' as const, description: '入门难度', order: 1 },
    { name: '2星', type: 'DIFFICULTY' as const, description: '简单', order: 2 },
    { name: '3星', type: 'DIFFICULTY' as const, description: '中等', order: 3 },
    { name: '4星', type: 'DIFFICULTY' as const, description: '困难', order: 4 },
    { name: '5星', type: 'DIFFICULTY' as const, description: '极难', order: 5 },
  ];

  for (const tag of difficultyTags) {
    await prisma.tag.upsert({
      where: { name: tag.name },
      update: {},
      create: tag,
    });
  }
  console.log('Created difficulty tags');

  // 竞赛类型标签
  const competitionTags = [
    { name: '迎春杯', type: 'COMPETITION' as const },
    { name: '华罗庚金杯', type: 'COMPETITION' as const },
    { name: '希望杯', type: 'COMPETITION' as const },
    { name: '走美杯', type: 'COMPETITION' as const },
    { name: 'IMC', type: 'COMPETITION' as const },
    { name: '其他', type: 'COMPETITION' as const },
  ];

  for (const tag of competitionTags) {
    await prisma.tag.upsert({
      where: { name: tag.name },
      update: {},
      create: tag,
    });
  }
  console.log('Created competition tags');

  // 一级知识点标签（后续由用户提供四级结构）
  const knowledgeTags = [
    { name: '计算', type: 'KNOWLEDGE' as const },
    { name: '几何', type: 'KNOWLEDGE' as const },
    { name: '应用题', type: 'KNOWLEDGE' as const },
    { name: '行程问题', type: 'KNOWLEDGE' as const },
    { name: '数论', type: 'KNOWLEDGE' as const },
    { name: '组合', type: 'KNOWLEDGE' as const },
    { name: '计数', type: 'KNOWLEDGE' as const },
    { name: '逻辑推理', type: 'KNOWLEDGE' as const },
  ];

  for (const tag of knowledgeTags) {
    await prisma.tag.upsert({
      where: { name: tag.name },
      update: {},
      create: tag,
    });
  }
  console.log('Created knowledge tags');

  console.log('Seed completed successfully');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
