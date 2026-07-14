-- CreateTable
CREATE TABLE "AcquisitionScan" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'processing',
    "domains" TEXT[],
    "domainCount" INTEGER NOT NULL DEFAULT 0,
    "result" JSONB,
    "error" TEXT,
    "scannedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AcquisitionScan_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AcquisitionScan_userId_createdAt_idx" ON "AcquisitionScan"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "AcquisitionScan_status_idx" ON "AcquisitionScan"("status");

-- AddForeignKey
ALTER TABLE "AcquisitionScan" ADD CONSTRAINT "AcquisitionScan_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
