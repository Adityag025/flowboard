-- AlterTable
ALTER TABLE "issues" ADD COLUMN     "aiSummary" TEXT,
ADD COLUMN     "aiSummaryAt" TIMESTAMP(3),
ADD COLUMN     "aiSummaryHash" TEXT;
