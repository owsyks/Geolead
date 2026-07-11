-- Security boundary metadata: rotating refresh-token families, guest ticket
-- capabilities, tenant-scoped webhook events, and immutable click targets.
ALTER TABLE "Session" ADD COLUMN "familyId" TEXT;
UPDATE "Session" SET "familyId" = "id" WHERE "familyId" IS NULL;
ALTER TABLE "Session" ALTER COLUMN "familyId" SET NOT NULL;
CREATE INDEX "Session_familyId_idx" ON "Session"("familyId");

ALTER TABLE "SupportTicket" ADD COLUMN "guestAccessTokenHash" TEXT;
CREATE UNIQUE INDEX "SupportTicket_guestAccessTokenHash_key" ON "SupportTicket"("guestAccessTokenHash");

ALTER TABLE "EmailLog" ADD COLUMN "clickDestination" TEXT;

ALTER TABLE "EmailVerificationJob" ADD COLUMN "userId" TEXT;
DELETE FROM "EmailVerificationJob" WHERE "userId" IS NULL;
ALTER TABLE "EmailVerificationJob" ALTER COLUMN "userId" SET NOT NULL;
CREATE INDEX "EmailVerificationJob_userId_idx" ON "EmailVerificationJob"("userId");
ALTER TABLE "EmailVerificationJob" ADD CONSTRAINT "EmailVerificationJob_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "WebhookEvent" ADD COLUMN "userId" TEXT;
CREATE INDEX "WebhookEvent_userId_idx" ON "WebhookEvent"("userId");
CREATE UNIQUE INDEX "WebhookEvent_provider_externalId_key" ON "WebhookEvent"("provider", "externalId");
ALTER TABLE "WebhookEvent" ADD CONSTRAINT "WebhookEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
