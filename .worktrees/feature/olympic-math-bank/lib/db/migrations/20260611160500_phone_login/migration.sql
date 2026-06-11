-- 用户表重构：将登录标识从 email 切换为 phone
-- 策略: 重建 users 表，保留关联数据（外键引用不会被破坏）

-- 1. 创建新 users 表（phone 为主键标识，email 为可选字段）
CREATE TABLE "new_users" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "phone" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'EDITOR',
    "password" TEXT,
    "email" TEXT,
    "image" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 2. 迁移现有用户数据：将旧 email 值暂存入 phone（后续通过 seed 脚本修正）
INSERT INTO "new_users" ("id", "phone", "name", "role", "password", "email", "image", "createdAt", "updatedAt")
SELECT "id", "email", "name", "role", "password", "email", "image", "createdAt", "updatedAt"
FROM "users";

-- 3. 创建唯一索引
CREATE UNIQUE INDEX "new_users_phone_key" ON "new_users"("phone");

-- 4. 删除旧表，重命名新表
DROP TABLE "users";
ALTER TABLE "new_users" RENAME TO "users";
