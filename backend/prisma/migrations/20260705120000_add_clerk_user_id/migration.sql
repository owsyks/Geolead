-- Clerk auth migration: link existing local User rows to their Clerk
-- identity. Nullable + unique — set on first Clerk sign-in via clerkUserId
-- lookup, or by email match for a pre-existing local account.

ALTER TABLE "User" ADD COLUMN "clerkUserId" TEXT;

CREATE UNIQUE INDEX "User_clerkUserId_key" ON "User"("clerkUserId");
