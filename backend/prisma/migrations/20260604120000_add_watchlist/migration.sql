-- AddRelation watchedDomains on User (no schema change needed, just new table FK)

-- CreateTable WatchedDomain
CREATE TABLE "WatchedDomain" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "domainName" TEXT NOT NULL,
    "priority" TEXT NOT NULL DEFAULT 'MEDIUM',
    "status" TEXT NOT NULL DEFAULT 'WATCHING',
    "notes" TEXT,
    "brandScore" INTEGER NOT NULL DEFAULT 0,
    "marketScore" INTEGER NOT NULL DEFAULT 0,
    "acquisitionScore" INTEGER NOT NULL DEFAULT 0,
    "estimatedValue" DOUBLE PRECISION,
    "aiRecommendation" TEXT,
    "aiReasoning" TEXT,
    "registrationStatus" TEXT,
    "registrar" TEXT,
    "expirationDate" TIMESTAMP(3),
    "lastCheckedAt" TIMESTAMP(3),
    "addedFrom" TEXT,
    "isFavorite" BOOLEAN NOT NULL DEFAULT true,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "WatchedDomain_pkey" PRIMARY KEY ("id")
);

-- CreateTable WatchedDomainEvent
CREATE TABLE "WatchedDomainEvent" (
    "id" TEXT NOT NULL,
    "watchedDomainId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "details" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "WatchedDomainEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable WatchlistReminder
CREATE TABLE "WatchlistReminder" (
    "id" TEXT NOT NULL,
    "watchedDomainId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "label" TEXT,
    "triggerAt" TIMESTAMP(3),
    "triggered" BOOLEAN NOT NULL DEFAULT false,
    "triggeredAt" TIMESTAMP(3),
    "notifyVia" TEXT NOT NULL DEFAULT 'IN_APP',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "WatchlistReminder_pkey" PRIMARY KEY ("id")
);

-- CreateTable WatchlistNotification
CREATE TABLE "WatchlistNotification" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "watchedDomainId" TEXT,
    "domainName" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "priority" TEXT NOT NULL DEFAULT 'NORMAL',
    "read" BOOLEAN NOT NULL DEFAULT false,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "WatchlistNotification_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey WatchedDomain → User
ALTER TABLE "WatchedDomain" ADD CONSTRAINT "WatchedDomain_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey WatchedDomainEvent → WatchedDomain
ALTER TABLE "WatchedDomainEvent" ADD CONSTRAINT "WatchedDomainEvent_watchedDomainId_fkey"
    FOREIGN KEY ("watchedDomainId") REFERENCES "WatchedDomain"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey WatchlistReminder → WatchedDomain
ALTER TABLE "WatchlistReminder" ADD CONSTRAINT "WatchlistReminder_watchedDomainId_fkey"
    FOREIGN KEY ("watchedDomainId") REFERENCES "WatchedDomain"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateIndex
CREATE UNIQUE INDEX "WatchedDomain_userId_domainName_key" ON "WatchedDomain"("userId", "domainName");
CREATE INDEX "WatchedDomain_userId_idx" ON "WatchedDomain"("userId");
CREATE INDEX "WatchedDomain_registrationStatus_idx" ON "WatchedDomain"("registrationStatus");
CREATE INDEX "WatchedDomain_status_idx" ON "WatchedDomain"("status");
CREATE INDEX "WatchedDomainEvent_watchedDomainId_idx" ON "WatchedDomainEvent"("watchedDomainId");
CREATE INDEX "WatchlistReminder_userId_idx" ON "WatchlistReminder"("userId");
CREATE INDEX "WatchlistReminder_triggered_triggerAt_idx" ON "WatchlistReminder"("triggered", "triggerAt");
CREATE INDEX "WatchlistNotification_userId_read_idx" ON "WatchlistNotification"("userId", "read");
CREATE INDEX "WatchlistNotification_userId_createdAt_idx" ON "WatchlistNotification"("userId", "createdAt");
