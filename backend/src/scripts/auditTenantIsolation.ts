import prisma from '../config/db.js';

type Finding = { name: string; count: number };

async function count(query: TemplateStringsArray): Promise<number> {
  const rows = await prisma.$queryRaw<{ count: bigint }[]>(query);
  return Number(rows[0]?.count ?? 0);
}

async function main() {
  const findings: Finding[] = [
    { name: 'search_tasks_without_owner', count: await count`SELECT COUNT(*) AS count FROM "SearchTask" WHERE "userId" IS NULL` },
    { name: 'leads_without_owner', count: await count`SELECT COUNT(*) AS count FROM "Lead" WHERE "ownerId" IS NULL` },
    { name: 'campaigns_without_owner', count: await count`SELECT COUNT(*) AS count FROM "Campaign" WHERE "userId" IS NULL` },
    { name: 'templates_without_owner', count: await count`SELECT COUNT(*) AS count FROM "Template" WHERE "userId" IS NULL` },
    { name: 'senders_without_owner', count: await count`SELECT COUNT(*) AS count FROM "SenderAccount" WHERE "userId" IS NULL` },
    { name: 'mailboxes_without_owner', count: await count`SELECT COUNT(*) AS count FROM "Mailbox" WHERE "userId" IS NULL` },
    { name: 'domains_without_owner', count: await count`SELECT COUNT(*) AS count FROM "Domain" WHERE "userId" IS NULL` },
    {
      name: 'lead_search_owner_mismatch',
      count: await count`SELECT COUNT(*) AS count FROM "Lead" l JOIN "SearchTask" t ON t.id = l."taskId" WHERE l."ownerId" IS DISTINCT FROM t."userId"`,
    },
    {
      name: 'campaign_domain_owner_mismatch',
      count: await count`SELECT COUNT(*) AS count FROM "Campaign" c JOIN "Domain" d ON d.id = c."domainId" WHERE c."userId" IS DISTINCT FROM d."userId"`,
    },
    {
      name: 'campaign_lead_owner_mismatch',
      count: await count`SELECT COUNT(*) AS count FROM "CampaignLead" cl JOIN "Campaign" c ON c.id = cl."campaignId" JOIN "Lead" l ON l.id = cl."leadId" WHERE c."userId" IS DISTINCT FROM l."ownerId"`,
    },
    {
      name: 'sequence_template_owner_mismatch',
      count: await count`SELECT COUNT(*) AS count FROM "SequenceStep" ss JOIN "Sequence" s ON s.id = ss."sequenceId" JOIN "Campaign" c ON c.id = s."campaignId" JOIN "Template" t ON t.id = ss."templateId" WHERE c."userId" IS DISTINCT FROM t."userId"`,
    },
    {
      name: 'email_log_owner_mismatch',
      count: await count`SELECT COUNT(*) AS count FROM "EmailLog" e JOIN "Campaign" c ON c.id = e."campaignId" JOIN "Lead" l ON l.id = e."leadId" LEFT JOIN "SenderAccount" s ON s.id = e."senderAccountId" LEFT JOIN "Template" t ON t.id = e."templateId" WHERE c."userId" IS DISTINCT FROM l."ownerId" OR (s.id IS NOT NULL AND c."userId" IS DISTINCT FROM s."userId") OR (t.id IS NOT NULL AND c."userId" IS DISTINCT FROM t."userId")`,
    },
    {
      name: 'email_log_thread_mismatch',
      count: await count`SELECT COUNT(*) AS count FROM "EmailLog" e JOIN "CampaignLead" cl ON cl.id = e."campaignLeadId" WHERE e."campaignId" <> cl."campaignId" OR e."leadId" <> cl."leadId"`,
    },
    {
      name: 'reply_owner_mismatch',
      count: await count`SELECT COUNT(*) AS count FROM "Reply" r JOIN "Campaign" c ON c.id = r."campaignId" JOIN "Lead" l ON l.id = r."leadId" LEFT JOIN "Mailbox" m ON m.id = r."mailboxId" WHERE c."userId" IS DISTINCT FROM l."ownerId" OR (m.id IS NOT NULL AND c."userId" IS DISTINCT FROM m."userId")`,
    },
    {
      name: 'reply_thread_mismatch',
      count: await count`SELECT COUNT(*) AS count FROM "Reply" r LEFT JOIN "CampaignLead" cl ON cl.id = r."campaignLeadId" LEFT JOIN "EmailLog" e ON e.id = r."emailLogId" WHERE (cl.id IS NOT NULL AND (r."campaignId" <> cl."campaignId" OR r."leadId" <> cl."leadId")) OR (e.id IS NOT NULL AND (r."campaignId" <> e."campaignId" OR r."leadId" <> e."leadId"))`,
    },
    {
      name: 'domain_buyer_lead_owner_mismatch',
      count: await count`SELECT COUNT(*) AS count FROM "DomainBuyer" b JOIN "Domain" d ON d.id = b."domainId" JOIN "Lead" l ON l.id = b."leadId" WHERE d."userId" IS DISTINCT FROM l."ownerId"`,
    },
    {
      name: 'domain_offer_buyer_mismatch',
      count: await count`SELECT COUNT(*) AS count FROM "DomainOffer" o JOIN "DomainBuyer" b ON b.id = o."buyerId" WHERE o."domainId" <> b."domainId"`,
    },
    {
      name: 'watchlist_reminder_owner_mismatch',
      count: await count`SELECT COUNT(*) AS count FROM "WatchlistReminder" r JOIN "WatchedDomain" w ON w.id = r."watchedDomainId" WHERE r."userId" <> w."userId"`,
    },
  ];

  const failures = findings.filter((finding) => finding.count > 0);
  console.log(JSON.stringify({ ok: failures.length === 0, findings }, null, 2));
  if (failures.length > 0) process.exitCode = 1;
}

main()
  .catch((error) => {
    console.error('[TenantIsolationAudit] Audit failed:', error instanceof Error ? error.message : 'unknown error');
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
