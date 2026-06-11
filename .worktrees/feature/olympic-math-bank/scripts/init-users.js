const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const path = require('path');

const dbPath = path.resolve(__dirname, '../lib/db/dev.db');
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
    update: {},
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
    update: {},
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
    update: {},
    create: {
      phone: 'reviewer_placeholder',
      name: '测试审核员',
      role: 'REVIEWER',
      password: reviewerPassword,
    },
  });
  console.log('Created reviewer user:', reviewer.phone);

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
