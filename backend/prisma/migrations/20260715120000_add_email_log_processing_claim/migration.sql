-- Prevent concurrent queue workers from sending one EmailLog more than once.
ALTER TABLE "EmailLog" ADD COLUMN "processingStartedAt" TIMESTAMP(3);

CREATE INDEX "EmailLog_status_scheduledAt_idx" ON "EmailLog"("status", "scheduledAt");
CREATE INDEX "EmailLog_status_processingStartedAt_idx" ON "EmailLog"("status", "processingStartedAt");
