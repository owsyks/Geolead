-- CreateTable
CREATE TABLE "DomainReputation" (
    "domain" TEXT NOT NULL,
    "totalSent" INTEGER NOT NULL DEFAULT 0,
    "totalDelivered" INTEGER NOT NULL DEFAULT 0,
    "totalBounced" INTEGER NOT NULL DEFAULT 0,
    "totalOpened" INTEGER NOT NULL DEFAULT 0,
    "totalReplied" INTEGER NOT NULL DEFAULT 0,
    "totalComplaints" INTEGER NOT NULL DEFAULT 0,
    "bounceRate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "deliveryRate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "replyRate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "reputationDelta" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "lastBounceAt" TIMESTAMP(3),
    "lastDeliveryAt" TIMESTAMP(3),
    "lastUpdatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "metadata" JSONB,

    CONSTRAINT "DomainReputation_pkey" PRIMARY KEY ("domain")
);

-- CreateIndex
CREATE INDEX "DomainReputation_bounceRate_idx" ON "DomainReputation"("bounceRate");

-- CreateIndex
CREATE INDEX "DomainReputation_lastUpdatedAt_idx" ON "DomainReputation"("lastUpdatedAt");
