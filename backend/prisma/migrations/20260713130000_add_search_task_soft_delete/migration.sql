ALTER TABLE "SearchTask" ADD COLUMN "deletedAt" TIMESTAMP(3);

CREATE INDEX "SearchTask_userId_deletedAt_idx" ON "SearchTask"("userId", "deletedAt");
