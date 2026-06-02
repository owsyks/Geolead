-- AlterTable
ALTER TABLE "LeadEmail" ADD COLUMN     "catchAllRisk" TEXT,
ADD COLUMN     "disposable" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "freeProvider" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "mxHost" TEXT,
ADD COLUMN     "mxValid" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "provider" TEXT,
ADD COLUMN     "reputationScore" INTEGER,
ADD COLUMN     "riskLevel" TEXT,
ADD COLUMN     "roleAccount" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "verificationMetadata" JSONB,
ADD COLUMN     "verifiedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "EmailVerificationJob" (
    "id" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "totalEmails" INTEGER NOT NULL DEFAULT 0,
    "processedEmails" INTEGER NOT NULL DEFAULT 0,
    "validEmails" INTEGER NOT NULL DEFAULT 0,
    "riskyEmails" INTEGER NOT NULL DEFAULT 0,
    "invalidEmails" INTEGER NOT NULL DEFAULT 0,
    "errorMessage" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmailVerificationJob_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "LeadEmail_email_idx" ON "LeadEmail"("email");

-- CreateIndex
CREATE INDEX "LeadEmail_status_idx" ON "LeadEmail"("status");

-- CreateIndex
CREATE INDEX "LeadEmail_leadId_status_idx" ON "LeadEmail"("leadId", "status");
