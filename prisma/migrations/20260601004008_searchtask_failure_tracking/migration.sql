-- AlterTable
ALTER TABLE "SearchTask" ADD COLUMN     "failedBusinesses" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "metadata" JSONB;
