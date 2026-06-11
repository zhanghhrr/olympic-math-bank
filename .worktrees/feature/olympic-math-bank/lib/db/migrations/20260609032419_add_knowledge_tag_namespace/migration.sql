-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_knowledge_tags" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "level" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "namespace" TEXT NOT NULL DEFAULT 'default',
    "module" TEXT NOT NULL,
    "topic" TEXT,
    "subtopic" TEXT,
    "knowledge" TEXT,
    "skill" TEXT,
    "parentId" TEXT,
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "knowledge_tags_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "knowledge_tags" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_knowledge_tags" ("code", "createdAt", "id", "knowledge", "level", "module", "name", "order", "parentId", "skill", "subtopic", "topic") SELECT "code", "createdAt", "id", "knowledge", "level", "module", "name", "order", "parentId", "skill", "subtopic", "topic" FROM "knowledge_tags";
DROP TABLE "knowledge_tags";
ALTER TABLE "new_knowledge_tags" RENAME TO "knowledge_tags";
CREATE UNIQUE INDEX "knowledge_tags_code_key" ON "knowledge_tags"("code");
CREATE INDEX "knowledge_tags_namespace_idx" ON "knowledge_tags"("namespace");
CREATE INDEX "knowledge_tags_module_idx" ON "knowledge_tags"("module");
CREATE INDEX "knowledge_tags_level_idx" ON "knowledge_tags"("level");
CREATE INDEX "knowledge_tags_code_idx" ON "knowledge_tags"("code");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
