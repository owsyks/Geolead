const { PrismaClient } = require('@prisma/client');
const db = new PrismaClient();

(async () => {
  const now = new Date();
  const startOfDay = new Date(now); startOfDay.setHours(0, 0, 0, 0);

  // All QUEUED logs (overall)
  const queuedTotal = await db.emailLog.count({ where: { status: 'QUEUED' } });
  const queuedDue = await db.emailLog.count({ where: { status: 'QUEUED', scheduledAt: { lte: now } } });
  const queuedDueFollowups = await db.emailLog.count({ where: { status: 'QUEUED', scheduledAt: { lte: now }, sequenceStepId: { not: null } } });

  console.log('NOW:', now.toISOString());
  console.log('QUEUED_TOTAL:', queuedTotal, 'QUEUED_DUE:', queuedDue, 'QUEUED_DUE_FOLLOWUPS:', queuedDueFollowups);

  // The exact 20 the scheduler would grab
  const dueLogs = await db.emailLog.findMany({
    where: { status: 'QUEUED', scheduledAt: { lte: now } },
    take: 20, orderBy: { scheduledAt: 'asc' },
    select: { id: true, toEmail: true, scheduledAt: true, sequenceStepId: true, campaignId: true, senderAccountId: true },
  });
  console.log('SCHEDULER_WOULD_GRAB:', JSON.stringify(dueLogs.map(l => ({
    fu: !!l.sequenceStepId, sched: l.scheduledAt, cid: l.campaignId, sid: l.senderAccountId, to: l.toEmail,
  })), null, 0));

  // Campaigns
  const campaigns = await db.campaign.findMany({
    orderBy: { createdAt: 'desc' }, take: 6,
    select: { id: true, name: true, status: true, dailyLimit: true },
  });
  for (const c of campaigns) {
    const sentToday = await db.emailLog.count({
      where: { campaignId: c.id, sentAt: { gte: startOfDay }, status: { in: ['SENT','DELIVERED','OPENED','CLICKED','REPLIED','SIMULATED'] } },
    });
    const queuedDueC = await db.emailLog.count({ where: { campaignId: c.id, status: 'QUEUED', scheduledAt: { lte: now } } });
    console.log(`CAMPAIGN ${c.name} status=${c.status} dailyLimit=${c.dailyLimit} sentToday=${sentToday} queuedDue=${queuedDueC}`);
  }

  // Senders + today usage
  const senders = await db.senderAccount.findMany({ select: { id: true, fromEmail: true, status: true, provider: true, dailyLimit: true, hourlyLimit: true } });
  for (const s of senders) {
    const daily = await db.emailLog.count({ where: { senderAccountId: s.id, sentAt: { gte: startOfDay } } });
    const hourAgo = new Date(now.getTime() - 3600e3);
    const hourly = await db.emailLog.count({ where: { senderAccountId: s.id, sentAt: { gte: hourAgo } } });
    console.log(`SENDER ${s.fromEmail} status=${s.status} provider=${s.provider} daily=${daily}/${s.dailyLimit} hourly=${hourly}/${s.hourlyLimit}`);
  }
})().catch(e => console.error(e)).finally(() => db.$disconnect());
