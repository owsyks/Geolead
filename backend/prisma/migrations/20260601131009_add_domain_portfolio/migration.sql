-- AlterTable
ALTER TABLE "Campaign" ADD COLUMN     "domainId" TEXT;

-- CreateTable
CREATE TABLE "Domain" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "name" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'Available',
    "purchaseDate" TIMESTAMP(3),
    "purchasePrice" DOUBLE PRECISION,
    "registrar" TEXT,
    "expirationDate" TIMESTAMP(3),
    "category" TEXT,
    "niche" TEXT,
    "industry" TEXT,
    "city" TEXT,
    "state" TEXT,
    "country" TEXT,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "targetIndustries" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "targetLocations" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "notes" TEXT,
    "brandingScore" INTEGER NOT NULL DEFAULT 0,
    "estimatedValue" DOUBLE PRECISION,
    "buyerDemandScore" INTEGER NOT NULL DEFAULT 0,
    "leadOpportunityScore" INTEGER NOT NULL DEFAULT 0,
    "saleProbability" INTEGER NOT NULL DEFAULT 0,
    "recommendedPrice" DOUBLE PRECISION,
    "bestIndustries" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "bestCities" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "outreachStrategy" TEXT,
    "aiSummary" TEXT,
    "archivedAt" TIMESTAMP(3),
    "soldAt" TIMESTAMP(3),
    "intelligenceUpdatedAt" TIMESTAMP(3),
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Domain_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DomainBuyer" (
    "id" TEXT NOT NULL,
    "domainId" TEXT NOT NULL,
    "leadId" TEXT,
    "businessName" TEXT NOT NULL,
    "contactName" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "website" TEXT,
    "location" TEXT,
    "industry" TEXT,
    "buyerScore" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'Prospect',
    "notes" TEXT,
    "lastContactedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DomainBuyer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DomainOffer" (
    "id" TEXT NOT NULL,
    "domainId" TEXT NOT NULL,
    "buyerId" TEXT,
    "direction" TEXT NOT NULL DEFAULT 'INBOUND',
    "amount" DOUBLE PRECISION NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "notes" TEXT,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DomainOffer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DomainSale" (
    "id" TEXT NOT NULL,
    "domainId" TEXT NOT NULL,
    "buyerName" TEXT NOT NULL,
    "buyerEmail" TEXT,
    "salePrice" DOUBLE PRECISION NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "saleDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "marketplace" TEXT,
    "fees" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DomainSale_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Domain_name_key" ON "Domain"("name");

-- CreateIndex
CREATE INDEX "Domain_status_idx" ON "Domain"("status");

-- CreateIndex
CREATE INDEX "Domain_archivedAt_idx" ON "Domain"("archivedAt");

-- CreateIndex
CREATE INDEX "Domain_soldAt_idx" ON "Domain"("soldAt");

-- CreateIndex
CREATE INDEX "DomainBuyer_domainId_idx" ON "DomainBuyer"("domainId");

-- CreateIndex
CREATE INDEX "DomainBuyer_status_idx" ON "DomainBuyer"("status");

-- CreateIndex
CREATE INDEX "DomainOffer_domainId_idx" ON "DomainOffer"("domainId");

-- CreateIndex
CREATE INDEX "DomainOffer_status_idx" ON "DomainOffer"("status");

-- CreateIndex
CREATE UNIQUE INDEX "DomainSale_domainId_key" ON "DomainSale"("domainId");

-- AddForeignKey
ALTER TABLE "Campaign" ADD CONSTRAINT "Campaign_domainId_fkey" FOREIGN KEY ("domainId") REFERENCES "Domain"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Domain" ADD CONSTRAINT "Domain_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DomainBuyer" ADD CONSTRAINT "DomainBuyer_domainId_fkey" FOREIGN KEY ("domainId") REFERENCES "Domain"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DomainOffer" ADD CONSTRAINT "DomainOffer_domainId_fkey" FOREIGN KEY ("domainId") REFERENCES "Domain"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DomainOffer" ADD CONSTRAINT "DomainOffer_buyerId_fkey" FOREIGN KEY ("buyerId") REFERENCES "DomainBuyer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DomainSale" ADD CONSTRAINT "DomainSale_domainId_fkey" FOREIGN KEY ("domainId") REFERENCES "Domain"("id") ON DELETE CASCADE ON UPDATE CASCADE;
