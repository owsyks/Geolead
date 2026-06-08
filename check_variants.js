const { PrismaClient } = require("@prisma/client");
const p = new PrismaClient();
(async () => {
  const campaigns = await p.campaign.findMany({
    where: { name: { in: ['dallasroofcontractor Outreach', 'DENTAL1', 'D1'] } },
    select: { name: true, metadata: true, dailyLimit: true }
  });
  for (const c of campaigns) {
    const m = c.metadata || {};
    const vars = m.variants?.variants || [];
    const approved = vars.filter(v => v.approved);
    console.log(c.name, '| limit:', c.dailyLimit, '| variants stored:', vars.length, '| approved:', approved.length);
  }
  // Check queued emails for these campaigns  
  const queued = await p.emailLog.count({ where: { campaign: { name: { in: ['dallasroofcontractor Outreach', 'DENTAL1', 'D1'] } }, status: 'QUEUED' } });
  const queuedNoVar = await p.emailLog.count({ where: { campaign: { name: { in: ['dallasroofcontractor Outreach', 'DENTAL1', 'D1'] } }, status: 'QUEUED', variant: null } });
  console.log('\nTotal QUEUED:', queued, '| no variant:', queuedNoVar);
  // Check sent today
  const today = new Date(); today.setHours(0,0,0,0);
  const sentToday = await p.emailLog.groupBy({ by: ['campaignId'], where: { campaignId: { in: (await p.campaign.findMany({ where: { name: { in: ['dallasroofcontractor Outreach', 'DENTAL1', 'D1'] } }, select: { id: true } })).map(c => c.id) }, sentAt: { gte: today }, status: { in: ['SENT','DELIVERED','OPENED','CLICKED','REPLIED','SIMULATED'] } }, _count: { id: true } });
  console.log('Sent today per campaign:');
  for (const r of sentToday) {
    const c = await p.campaign.findUnique({ where: { id: r.campaignId }, select: { name: true } });
    console.log(' ', c?.name, ':', r._count.id);
  }
  await p.$disconnect();
})();
