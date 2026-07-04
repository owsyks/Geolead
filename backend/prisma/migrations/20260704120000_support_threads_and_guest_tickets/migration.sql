-- Support tickets: allow guest (anonymous Contact-page) submissions, and add
-- a reply thread instead of a single opening body.

ALTER TABLE "SupportTicket" ALTER COLUMN "userId" DROP NOT NULL;
ALTER TABLE "SupportTicket" ADD COLUMN "guestName" TEXT;
ALTER TABLE "SupportTicket" ADD COLUMN "guestEmail" TEXT;

CREATE TABLE "SupportMessage" (
    "id" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,
    "sender" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SupportMessage_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "SupportMessage_ticketId_idx" ON "SupportMessage"("ticketId");

ALTER TABLE "SupportMessage" ADD CONSTRAINT "SupportMessage_ticketId_fkey"
    FOREIGN KEY ("ticketId") REFERENCES "SupportTicket"("id") ON DELETE CASCADE ON UPDATE CASCADE;
