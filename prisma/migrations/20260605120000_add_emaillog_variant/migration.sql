-- Add variant label to EmailLog for the Campaign Variant Engine
ALTER TABLE "EmailLog" ADD COLUMN IF NOT EXISTS "variant" TEXT;
CREATE INDEX IF NOT EXISTS "EmailLog_variant_idx" ON "EmailLog"("variant");
