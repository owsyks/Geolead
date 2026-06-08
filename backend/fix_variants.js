const { PrismaClient } = require("@prisma/client");
const p = new PrismaClient();
(async () => {
  // Find all campaigns with stored variants
  const campaigns = await p.campaign.findMany({ select: { id: true, name: true, metadata: true } });
  let updated = 0;
  for (const c of campaigns) {
    const vars = (c.metadata || {}).variants?.variants || [];
    const approved = vars.filter(v => v.approved);
    if (approved.length === 0) continue;
    // Assign random variant to all variant-less QUEUED emails for this campaign
    const logs = await p.emailLog.findMany({ where: { campaignId: c.id, status: 'QUEUED', variant: null }, select: { id: true } });
    for (const log of logs) {
      await p.emailLog.update({
        where: { id: log.id },
        data: { variant: approved[Math.floor(Math.random() * approved.length)].key }
      });
      updated++;
    }
    if (logs.length > 0) console.log(`${c.name}: assigned variants to ${logs.length} emails`);
  }
  console.log(`\nTotal updated: ${updated} emails`);
  await p.$disconnect();
})();
