-- DRY_RUN rows were development fixtures but were provisioned as active tenant
-- senders, consuming paid/trial sender quotas. EmailLog.senderAccountId uses
-- ON DELETE SET NULL, so historical delivery records remain intact.
DELETE FROM "SenderAccount"
WHERE UPPER("provider") = 'DRY_RUN'
   OR LOWER("fromEmail") LIKE '%@geoleadai.local'
   OR (UPPER("provider") = 'RESEND' AND LOWER("fromEmail") = 'verify@geolead.tech');
