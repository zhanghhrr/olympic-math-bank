-- AlterTable
ALTER TABLE "question_versions" ADD COLUMN "formulas" TEXT;
ALTER TABLE "question_versions" ADD COLUMN "sourceBlocks" TEXT;

-- AlterTable
ALTER TABLE "questions" ADD COLUMN "formulas" TEXT;
ALTER TABLE "questions" ADD COLUMN "sourceBlocks" TEXT;
ALTER TABLE "questions" ADD COLUMN "sourcePdfName" TEXT;
