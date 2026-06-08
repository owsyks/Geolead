const { PrismaClient } = require("@prisma/client");
const p = new PrismaClient();
(async () => {
  const c = await p.campaign.findFirst({ where: { name: { startsWith: 'coloradospringsmoving' } }, select: { metadata: true } });
  const meta = c?.metadata || {};
  const variants = meta.variants?.variants || [];
  for (const v of variants) {
    console.log(`${v.key}: approved=${v.approved} spam=${v.spamScore} subject="${(v.subject||'').substring(0,60)}"`);
  }
  // Also check a SENT email log
  const sent = await p.emailLog.findFirst({ where: { status: 'SENT' }, select: { variant: true, subject: true }, orderBy: { sentAt: 'desc' } });
  console.log('\nLast SENT email:', sent?.variant || 'NONE', '|', (sent?.subject||'').substring(0,60));
  await p.$disconnect();
})();
