-- Repair optional foreign-key links created before tenant ownership was
-- enforced. Sequence steps and email logs already persist their rendered
-- subject/body/from/provider fields, so detaching a cross-tenant template or
-- sender preserves history and send behavior while removing the data bridge.

UPDATE "SequenceStep" AS step
SET "templateId" = NULL
FROM "Sequence" AS sequence, "Campaign" AS campaign, "Template" AS template
WHERE step."sequenceId" = sequence.id
  AND sequence."campaignId" = campaign.id
  AND step."templateId" = template.id
  AND campaign."userId" IS DISTINCT FROM template."userId";

UPDATE "EmailLog" AS log
SET "templateId" = NULL
FROM "Campaign" AS campaign, "Template" AS template
WHERE log."campaignId" = campaign.id
  AND log."templateId" = template.id
  AND campaign."userId" IS DISTINCT FROM template."userId";

UPDATE "EmailLog" AS log
SET "senderAccountId" = NULL
FROM "Campaign" AS campaign, "SenderAccount" AS sender
WHERE log."campaignId" = campaign.id
  AND log."senderAccountId" = sender.id
  AND campaign."userId" IS DISTINCT FROM sender."userId";
