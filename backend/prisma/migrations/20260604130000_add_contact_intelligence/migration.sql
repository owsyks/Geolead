-- Add contact intelligence fields to Lead
ALTER TABLE "Lead" ADD COLUMN IF NOT EXISTS "whatsappScore"        INTEGER;
ALTER TABLE "Lead" ADD COLUMN IF NOT EXISTS "whatsappConfidence"   TEXT;
ALTER TABLE "Lead" ADD COLUMN IF NOT EXISTS "bestContactChannel"   TEXT;
ALTER TABLE "Lead" ADD COLUMN IF NOT EXISTS "contactChannelScores" JSONB;

CREATE INDEX IF NOT EXISTS "Lead_bestContactChannel_idx"  ON "Lead"("bestContactChannel");
CREATE INDEX IF NOT EXISTS "Lead_whatsappScore_idx"       ON "Lead"("whatsappScore");
