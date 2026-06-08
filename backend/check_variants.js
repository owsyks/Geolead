const { PrismaClient } = require("@prisma/client");
const p = new PrismaClient();
(async () => {
  const campaigns = await p.campaign.findMany({ select: { id: true, name: true, metadata: true }, orderBy: { updatedAt: 'desc' }, take: 3 });
  console.log('=== CAMPAIGNS ===');
  for (const c of campaigns) {
    const m = c.metadata || {};
    console.log(c.name.substring(0,30), '| variants:', m.variants ? `YES (${m.variants.variants?.length || 0})` : 'NONE');
  }
  const logs = await p.emailLog.findMany({ select: { id: true, subject: true, variant: true, status: true, toEmail: true }, orderBy: { createdAt: 'desc' }, take: 10 });
  console.log('\n=== RECENT EMAIL LOGS ===');
  for (const l of logs) {
    console.log(l.id.substring(0,8), '| var:', l.variant || 'NONE', '|', (l.subject||'').substring(0,35), '|', l.status, '|', l.toEmail.substring(0,25));
  }
  await p.$disconnect();
})();
