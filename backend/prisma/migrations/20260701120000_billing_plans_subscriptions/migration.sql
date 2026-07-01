-- Paid plan tiers + PayPal subscriptions + trial clock.
-- Adds plan status/trial/period fields to User and a Subscription table.

-- User billing fields. Existing rows default to an already-ended trial state so
-- they are NOT silently granted paid access; the app owner is reconciled below.
ALTER TABLE "User" ADD COLUMN     "planStatus" TEXT NOT NULL DEFAULT 'trialing';
ALTER TABLE "User" ADD COLUMN     "trialEndsAt" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN     "currentPeriodEnd" TIMESTAMP(3);
-- Default plan changes from 'free' to 'trial' for new rows.
ALTER TABLE "User" ALTER COLUMN "plan" SET DEFAULT 'trial';

-- Subscription table (one active billing record per user; provider = paddle | coinbase).
CREATE TABLE "Subscription" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'paddle',
    "providerSubscriptionId" TEXT,
    "providerCustomerId" TEXT,
    "planTier" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "currentPeriodEnd" TIMESTAMP(3),
    "cancelAtPeriodEnd" BOOLEAN NOT NULL DEFAULT false,
    "rawState" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Subscription_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Subscription_userId_key" ON "Subscription"("userId");
CREATE UNIQUE INDEX "Subscription_providerSubscriptionId_key" ON "Subscription"("providerSubscriptionId");
CREATE INDEX "Subscription_userId_idx" ON "Subscription"("userId");
CREATE INDEX "Subscription_providerSubscriptionId_idx" ON "Subscription"("providerSubscriptionId");

ALTER TABLE "Subscription"
    ADD CONSTRAINT "Subscription_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Data reconciliation for pre-existing accounts:
--   * The seeded/admin owner keeps full access (grant an open-ended active Pro so
--     the live workspace isn't locked out by the new gates).
--   * Everyone else lands on a fresh 7-day trial from the migration time.
UPDATE "User"
   SET "planStatus" = 'active', "plan" = 'pro'
 WHERE "role" = 'ADMIN' AND "emailVerified" = true;

UPDATE "User"
   SET "planStatus" = 'trialing',
       "plan" = 'trial',
       "trialEndsAt" = CURRENT_TIMESTAMP + INTERVAL '7 days'
 WHERE "planStatus" = 'trialing' AND "trialEndsAt" IS NULL;
