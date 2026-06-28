const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();

(async () => {
  const tasks = await p.searchTask.findMany({
    orderBy: { createdAt: 'desc' },
    take: 5,
    select: {
      id: true, keyword: true, status: true, progress: true,
      totalLeads: true, validEmails: true, failedBusinesses: true,
      createdAt: true, metadata: true,
    }
  });
  console.log('=== RECENT TASKS ===');
  for (const t of tasks) {
    console.log(JSON.stringify(t));
  }

  const leads = await p.lead.findMany({
    orderBy: { createdAt: 'desc' },
    take: 10,
    select: { id: true, businessName: true, website: true, domainMatchScore: true, phoneNumbers: true }
  });
  console.log('\n=== RECENT LEADS (first 10) ===');
  for (const l of leads) {
    console.log(`${l.businessName} | score:${l.domainMatchScore} | website:${l.website || 'NONE'} | phones:${(l.phoneNumbers||[]).length}`);
  }

  const leadCount = await p.lead.count();
  const emailCount = await p.leadEmail.count();
  const validEmails = await p.leadEmail.count({ where: { status: 'VALID' } });
  const riskyEmails = await p.leadEmail.count({ where: { status: 'RISKY' } });
  console.log(`\n=== STATS ===`);
  console.log(`leads: ${leadCount}, emails: ${emailCount} (valid:${validEmails}, risky:${riskyEmails})`);

  await p.$disconnect();
})();
