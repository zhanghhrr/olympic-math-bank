import { PrismaClient } from '@prisma/client';
import path from 'path';

// 确保数据库路径是绝对的
function getDatabaseUrl(): string {
  const dbPath = process.env.DATABASE_URL || 'file:./lib/db/dev.db';
  if (dbPath.startsWith('file:')) {
    const dbFile = dbPath.slice(5); // 去掉 "file:" 前缀
    // 如果是相对路径，转换为绝对路径
    if (!path.isAbsolute(dbFile)) {
      return 'file:' + path.resolve(process.cwd(), dbFile);
    }
  }
  return dbPath;
}

const globalForPrisma = global as unknown as { prisma: PrismaClient };

const prismaClient = new PrismaClient({
  datasources: {
    db: {
      url: getDatabaseUrl()
    }
  }
});

export const prisma = globalForPrisma.prisma || prismaClient;

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;
