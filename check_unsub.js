const { PrismaClient } = require('@prisma/client');
const db = new PrismaClient();
Promise.all([
  db.emailLog.findMany({
    where: { status: 'UNSUBSCRIBED' },
    take: 10,
    select: { id: true, toEmail: true, status: true, errorMessage: true, unsubscribedAt: true, createdAt: true }
  }),
  db.lead.findMany({
    where: { OR: [{ unsubscribed: true }, { doNotContact: true }] },
    take: 10,
    select: { id: true, businessName: true, unsubscribed: true, doNotContact: true }
  }),
  db.emailLog.groupBy({ by: ['status'], _count: { id: true } }),
]).then(([logs, leads, counts]) => {
  console.log('UNSUBSCRIBED_LOGS:', JSON.stringify(logs));
  console.log('DNC_LEADS:', JSON.stringify(leads));
  console.log('STATUS_COUNTS:', JSON.stringify(counts));
}).catch(e => console.error(e)).finally(() => db.$disconnect());
