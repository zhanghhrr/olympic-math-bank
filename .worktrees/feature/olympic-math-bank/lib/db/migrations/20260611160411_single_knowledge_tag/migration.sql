-- 将多对多知识标签关联改为单标签字段
-- 1. 先添加新字段（可空）
ALTER TABLE "questions" ADD COLUMN "knowledgeTagId" TEXT;

-- 2. 迁移现有数据：从关联表取第一个标签
UPDATE "questions"
SET "knowledgeTagId" = (
  SELECT "knowledgeTagId"
  FROM "question_knowledge_tags"
  WHERE "question_knowledge_tags"."questionId" = "questions"."id"
  LIMIT 1
);

-- 3. 添加外键约束
ALTER TABLE "questions" ADD CONSTRAINT "questions_knowledgeTagId_fkey" 
  FOREIGN KEY ("knowledgeTagId") REFERENCES "knowledge_tags"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- 4. 删除多对多关联表
DROP TABLE "question_knowledge_tags";
