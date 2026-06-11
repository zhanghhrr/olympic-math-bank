/*
  Warnings:

  - You are about to drop the `question_knowledge_tags` table. If the table is not empty, all the data it contains will be lost.
  - Added the required column `phone` to the `users` table without a default value. This is not possible if the table is not empty.

*/
-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE "question_knowledge_tags";
PRAGMA foreign_keys=on;

-- CreateTable
CREATE TABLE "export_jobs" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "fileName" TEXT NOT NULL,
    "filePath" TEXT,
    "fileSize" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "mode" TEXT NOT NULL DEFAULT 'student',
    "questionCount" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT,
    "blocksJson" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" DATETIME,
    CONSTRAINT "export_jobs_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_questions" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "content" TEXT NOT NULL,
    "answer" TEXT NOT NULL,
    "solution" TEXT,
    "type" TEXT NOT NULL,
    "options" TEXT,
    "grade" TEXT NOT NULL,
    "difficulty" INTEGER NOT NULL,
    "source" TEXT,
    "year" INTEGER,
    "competition" TEXT,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "formulas" TEXT,
    "sourceBlocks" TEXT,
    "sourcePdfName" TEXT,
    "createdById" TEXT NOT NULL,
    "currentVersionId" TEXT,
    "knowledgeTagId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "questions_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "questions_knowledgeTagId_fkey" FOREIGN KEY ("knowledgeTagId") REFERENCES "knowledge_tags" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_questions" ("answer", "competition", "content", "createdAt", "createdById", "currentVersionId", "difficulty", "formulas", "grade", "id", "options", "solution", "source", "sourceBlocks", "sourcePdfName", "status", "type", "updatedAt", "year") SELECT "answer", "competition", "content", "createdAt", "createdById", "currentVersionId", "difficulty", "formulas", "grade", "id", "options", "solution", "source", "sourceBlocks", "sourcePdfName", "status", "type", "updatedAt", "year" FROM "questions";
DROP TABLE "questions";
ALTER TABLE "new_questions" RENAME TO "questions";
CREATE UNIQUE INDEX "questions_currentVersionId_key" ON "questions"("currentVersionId");
CREATE TABLE "new_users" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "phone" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'EDITOR',
    "password" TEXT,
    "email" TEXT,
    "image" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_users" ("createdAt", "email", "id", "image", "name", "password", "role", "updatedAt") SELECT "createdAt", "email", "id", "image", "name", "password", "role", "updatedAt" FROM "users";
DROP TABLE "users";
ALTER TABLE "new_users" RENAME TO "users";
CREATE UNIQUE INDEX "users_phone_key" ON "users"("phone");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
