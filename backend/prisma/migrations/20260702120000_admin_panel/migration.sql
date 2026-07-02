-- Admin panel: last-seen tracking + support tickets.

ALTER TABLE "User" ADD COLUMN "lastSeenAt" TIMESTAMP(3);

CREATE TABLE "SupportTicket" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'SUPPORT',
    "priority" TEXT NOT NULL DEFAULT 'NORMAL',
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "assignedTo" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SupportTicket_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "SupportTicket_status_idx" ON "SupportTicket"("status");
CREATE INDEX "SupportTicket_userId_idx" ON "SupportTicket"("userId");

ALTER TABLE "SupportTicket" ADD CONSTRAINT "SupportTicket_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
