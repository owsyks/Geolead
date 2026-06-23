const { PrismaClient } = require('@prisma/client');
const db = new PrismaClient();

(async () => {
  const now = new Date();
  const startOfDay = new Date(now); startOfDay.setHours(0, 0, 0, 0);

  const campaigns = await db.campaign.findMany({
    where: { OR: [
      { geoDomain: { contains: 'dallasroof', mode: 'insensitive' } },
      { name: { contains: 'dallasroof', mode: 'insensitive' } },
    ] },
    select: { id: true, name: true, status: true, geoDomain: true, dailyLimit: true,
      sendWindowStart: true, sendWindowEnd: true, metadata: true, createdAt: true },
  });
  console.log('NOW:', now.toISOString());
  if (campaigns.length === 0) { console.log('NO CAMPAIGN matched dallasroof'); return; }

  for (const c of campaigns) {
    console.log('\n=== CAMPAIGN', c.name, c.id, '===');
    console.log('status:', c.status, '| domain:', c.geoDomain, '| dailyLimit:', c.dailyLimit,
      '| window:', c.sendWindowStart, '-', c.sendWindowEnd);

    const sentToday = await db.emailLog.count({ where: { campaignId: c.id, sentAt: { gte: startOfDay },
      status: { in: ['SENT','DELIVERED','OPENED','CLICKED','REPLIED','SIMULATED'] } } });
    console.log('sentToday:', sentToday);

    // status breakdown of all logs
    const byStatus = await db.emailLog.groupBy({ by: ['status'], where: { campaignId: c.id }, _count: { id: true } });
    console.log('logs byStatus:', JSON.stringify(byStatus.map(s => ({ [s.status]: s._count.id }))));

    // queued follow-ups (have a sequenceStepId)
    const queued = await db.emailLog.findMany({
      where: { campaignId: c.id, status: 'QUEUED' },
      select: { id: true, toEmail: true, scheduledAt: true, sequenceStepId: true,
        senderAccountId: true, errorMessage: true, campaignLeadId: true },
      orderBy: { scheduledAt: 'asc' }, take: 15,
    });
    console.log('QUEUED count:', queued.length);
    for (const q of queued) {
      console.log('  Q', q.scheduledAt?.toISOString(), 'due:', q.scheduledAt <= now,
        'fu:', !!q.sequenceStepId, 'sender:', q.senderAccountId, '->', q.toEmail);
    }

    // campaignLead statuses
    const clByStatus = await db.campaignLead.groupBy({ by: ['status'], where: { campaignId: c.id }, _count: { id: true } });
    console.log('campaignLeads byStatus:', JSON.stringify(clByStatus.map(s => ({ [s.status]: s._count.id }))));

    // sequence steps
    const cls = await db.campaignLead.findMany({ where: { campaignId: c.id }, select: { sequenceId: true }, take: 1 });
    if (cls[0]?.sequenceId) {
      const steps = await db.sequenceStep.findMany({ where: { sequenceId: cls[0].sequenceId },
        select: { stepOrder: true, stepType: true, delayHours: true }, orderBy: { stepOrder: 'asc' } });
      console.log('SEQUENCE steps:', JSON.stringify(steps));
    } else {
      console.log('SEQUENCE: none attached to campaignLeads');
    }
  }

  // sender usage
  const senders = await db.senderAccount.findMany({ select: { id: true, fromEmail: true, status: true, provider: true, dailyLimit: true, hourlyLimit: true } });
  console.log('\n--- SENDERS ---');
  for (const s of senders) {
    const daily = await db.emailLog.count({ where: { senderAccountId: s.id, sentAt: { gte: startOfDay } } });
    const hourly = await db.emailLog.count({ where: { senderAccountId: s.id, sentAt: { gte: new Date(now.getTime() - 3600e3) } } });
    console.log(`${s.fromEmail} ${s.status}/${s.provider} daily=${daily}/${s.dailyLimit} hourly=${hourly}/${s.hourlyLimit}`);
  }
})().catch(e => console.error(e)).finally(() => db.$disconnect());
