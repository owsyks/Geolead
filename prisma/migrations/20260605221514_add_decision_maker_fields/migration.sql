-- DropIndex
DROP INDEX "EmailLog_variant_idx";

-- DropIndex
DROP INDEX "Lead_bestContactChannel_idx";

-- DropIndex
DROP INDEX "Lead_whatsappScore_idx";

-- AlterTable
ALTER TABLE "Lead" ADD COLUMN     "businessQualityScore" INTEGER,
ADD COLUMN     "buyerInsights" JSONB,
ADD COLUMN     "buyerIntentScore" INTEGER,
ADD COLUMN     "contactStrategy" TEXT,
ADD COLUMN     "decisionMakerEmail" TEXT,
ADD COLUMN     "decisionMakerName" TEXT,
ADD COLUMN     "decisionMakerRole" TEXT,
ADD COLUMN     "decisionMakerScore" INTEGER,
ADD COLUMN     "domainUpgradeScore" INTEGER,
ADD COLUMN     "priorityScore" INTEGER;

-- AlterTable
ALTER TABLE "WatchedDomain" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- CreateIndex
CREATE INDEX "Lead_priorityScore_idx" ON "Lead"("priorityScore");

-- CreateIndex
CREATE INDEX "Lead_buyerIntentScore_idx" ON "Lead"("buyerIntentScore");

-- CreateIndex
CREATE INDEX "Lead_decisionMakerRole_idx" ON "Lead"("decisionMakerRole");

-- CreateIndex
CREATE INDEX "Lead_decisionMakerScore_idx" ON "Lead"("decisionMakerScore");
