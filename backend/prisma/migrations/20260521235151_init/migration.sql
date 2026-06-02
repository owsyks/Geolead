-- CreateTable
CREATE TABLE "SearchTask" (
    "id" TEXT NOT NULL,
    "keyword" TEXT NOT NULL,
    "domainIdea" TEXT NOT NULL,
    "country" TEXT,
    "cityState" TEXT,
    "searchDepth" INTEGER NOT NULL DEFAULT 10,
    "status" TEXT NOT NULL,
    "progress" INTEGER NOT NULL DEFAULT 0,
    "totalLeads" INTEGER NOT NULL DEFAULT 0,
    "validEmails" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SearchTask_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Lead" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "businessName" TEXT NOT NULL,
    "website" TEXT,
    "location" TEXT,
    "googleMapsLink" TEXT,
    "category" TEXT,
    "rating" DOUBLE PRECISION,
    "reviewsCount" INTEGER,
    "phoneNumbers" TEXT[],
    "socialLinks" TEXT[],
    "domainMatchScore" INTEGER NOT NULL,
    "scoreExplanation" TEXT,
    "notes" TEXT,
    "companySize" TEXT,
    "summary" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Lead_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeadEmail" (
    "id" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "confidenceScore" DOUBLE PRECISION NOT NULL,
    "sourcePage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LeadEmail_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "Lead" ADD CONSTRAINT "Lead_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "SearchTask"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadEmail" ADD CONSTRAINT "LeadEmail_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE CASCADE ON UPDATE CASCADE;
