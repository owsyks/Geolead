const { PrismaClient } = require("@prisma/client");
const p = new PrismaClient();
(async () => {
  const c = await p.campaign.findFirst({ where: { name: 'D1' }, select: { metadata: true, name: true } });
  const vars = (c?.metadata || {}).variants?.variants || [];
  console.log(`Campaign: ${c?.name} — ${vars.length} variants:`);
  for (const v of vars) {
    console.log(`${v.key}: approved=${v.approved} spam=${v.spamScore}`);
    console.log(`   subject: "${v.subject?.substring(0,100)}"`);
    console.log(`   body: "${v.body?.substring(0,100)}"`);
    console.log('');
  }
  await p.$disconnect();
})();
