const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const path = require('path');

const dbPath = path.resolve(__dirname, '../lib/db/test.db');
const prisma = new PrismaClient({
  datasources: {
    db: {
      url: `file:${dbPath}`,
    },
  },
});

async function main() {
  console.log('Initializing test database...');

  // 创建默认管理员用户
  const adminPassword = await bcrypt.hash('admin123', 10);
  const admin = await prisma.user.upsert({
    where: { email: 'admin@example.com' },
    update: {},
    create: {
      email: 'admin@example.com',
      name: '管理员',
      role: 'ADMIN',
      password: adminPassword,
    },
  });
  console.log('Created admin user:', admin.email);

  // 创建测试教研员
  const editorPassword = await bcrypt.hash('editor123', 10);
  const editor = await prisma.user.upsert({
    where: { email: 'editor@example.com' },
    update: {},
    create: {
      email: 'editor@example.com',
      name: '测试教研员',
      role: 'EDITOR',
      password: editorPassword,
    },
  });
  console.log('Created editor user:', editor.email);

  // 创建测试审核员
  const reviewerPassword = await bcrypt.hash('reviewer123', 10);
  const reviewer = await prisma.user.upsert({
    where: { email: 'reviewer@example.com' },
    update: {},
    create: {
      email: 'reviewer@example.com',
      name: '测试审核员',
      role: 'REVIEWER',
      password: reviewerPassword,
    },
  });
  console.log('Created reviewer user:', reviewer.email);

  console.log('Test database initialized successfully');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
