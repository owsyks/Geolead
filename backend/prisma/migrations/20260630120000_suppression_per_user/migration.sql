-- Scope the suppression list per user (multi-tenancy isolation).
-- Adds SuppressionEntry.userId, replaces the global unique(email) with a
-- per-user unique(userId, email), and links it to the owning user.

ALTER TABLE "SuppressionEntry" ADD COLUMN "userId" TEXT;

-- Drop the old global-unique-on-email index.
DROP INDEX IF EXISTS "SuppressionEntry_email_key";

-- Per-user uniqueness. NULL userId rows (legacy/unattributed) are treated as
-- distinct by Postgres and are excluded from every user's scoped queries.
CREATE UNIQUE INDEX "SuppressionEntry_userId_email_key" ON "SuppressionEntry"("userId", "email");
CREATE INDEX "SuppressionEntry_userId_idx" ON "SuppressionEntry"("userId");

ALTER TABLE "SuppressionEntry"
  ADD CONSTRAINT "SuppressionEntry_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
