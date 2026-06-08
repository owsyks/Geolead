import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, randomUUID } from 'node:crypto';
import { resolveMx } from 'node:dns/promises';
import { resolveTxt } from 'node:dns/promises';
import axios from 'axios';
import type { Prisma } from '@prisma/client';
import prisma from '../config/db.js';
import { outboundQueue } from '../queues/queues.js';
import { generateOutboundEmail, generateFollowUpBody, rewriteEmail, scoreSpamRisk, type EmailGenerationInput } from './outboundAi.js';
import { generateCampaignVariants, localVariants, VARIANT_ORDER, type GeneratedVariant, type VariantBundle } from './campaignVariants.js';
import { broadcastOutboundEvent } from './outboundRealtime.js';
import { recordCampaignOutcome } from './campaignFeedback.js';
import { connectSmtp, type SmtpClient } from './smtpTransport.js';
import { getSetting } from './settings.js';

const OUTBOUND_BASE_URL = process.env.OUTBOUND_BASE_URL || 'http://localhost:5000';
const DEFAULT_PHYSICAL_ADDRESS = process.env.OUTBOUND_PHYSICAL_ADDRESS || 'GeoLead AI, 123 Market St, Austin, TX 78701';
const DEFAULT_ADMIN_EMAIL = process.env.OUTBOUND_ADMIN_EMAIL || 'admin@geoleadai.local';
const encryptedFieldPattern = /(api|secret|token|password|key|access)/i;

let schedulerStarted = false;
let tickInProgress = false;

export interface CampaignCreateInput {
  name: string;
  geoDomain?: string;
  niche?: string;
  cityState?: string;
  objective?: string;
  tone?: string;
  language?: string;
  dailyLimit?: number;
  smartDelayMin?: number;
  smartDelayMax?: number;
  leadIds?: string[];
  uploadedEmails?: string[];
  templateId?: string;
  status?: string;
  domainId?: string;
  instant?: boolean;
  senderAccountId?: string;
}

export interface TemplateInput {
  name: string;
  type?: string;
  purpose?: string;
  language?: string;
  tone?: string;
  subject: string;
  previewText?: string;
  body: string;
  tags?: string[];
}

export interface SenderAccountInput {
  label: string;
  provider: string;
  fromName: string;
  fromEmail: string;
  replyTo?: string;
  status?: string;
  dailyLimit?: number;
  hourlyLimit?: number;
  timezone?: string;
  providerConfig?: Record<string, unknown>;
}

export interface SenderVerificationResult {
  domain: string;
  spfStatus: string;
  dkimStatus: string;
  dmarcStatus: string;
  deliverabilityScore: number;
  records: {
    spf: string[];
    dkim: string[];
    dmarc: string[];
  };
}

export async function ensureOutboundSeedData() {
  const user = await prisma.user.upsert({
    where: { email: DEFAULT_ADMIN_EMAIL },
    update: { isActive: true },
    create: {
      email: DEFAULT_ADMIN_EMAIL,
      name: 'GeoLead Admin',
      role: 'ADMIN',
      timezone: 'America/Chicago',
      locale: 'en',
    },
  });

  if ((await prisma.template.count()) === 0) {
    await prisma.template.createMany({
      data: defaultTemplates(user.id),
    });
  }

  if ((await prisma.senderAccount.count()) === 0) {
    await prisma.senderAccount.create({
      data: {
        userId: user.id,
        label: 'Dry-run sender',
        provider: 'DRY_RUN',
        fromName: 'GeoLead AI',
        fromEmail: 'outreach@geoleadai.local',
        replyTo: DEFAULT_ADMIN_EMAIL,
        status: 'active',
        timezone: 'America/Chicago',
        dailyLimit: 30,
        hourlyLimit: 8,
        warmupEnabled: true,
        warmupTarget: 20,
        sendWindowStart: '09:00',
        sendWindowEnd: '16:30',
        dkimStatus: 'pending',
        spfStatus: 'pending',
        dmarcStatus: 'pending',
        deliverabilityScore: 72,
        providerConfig: { dryRun: true },
      },
    });
  }

  // Auto-create Resend sender if configured (from Settings or env) and not
  // already present. getSetting falls back to env, so existing deployments keep
  // working and users who set the key in the Settings page get provisioned too.
  const [resendKey, resendFromEmail, resendFromName, resendReplyTo] = await Promise.all([
    getSetting('resendApiKey', user.id),
    getSetting('resendFromEmail', user.id),
    getSetting('resendFromName', user.id),
    getSetting('resendReplyTo', user.id),
  ]);
  if (resendKey && resendFromEmail) {
    const fromEmail = resendFromEmail;
    const existingResend = await prisma.senderAccount.findFirst({
      where: { provider: 'RESEND', fromEmail },
    });
    if (!existingResend) {
      await prisma.senderAccount.create({
        data: {
          userId: user.id,
          label: `Resend - ${fromEmail}`,
          provider: 'RESEND',
          fromName: resendFromName || 'Outreach',
          fromEmail,
          replyTo: resendReplyTo || fromEmail,
          status: 'active',
          timezone: 'America/Chicago',
          dailyLimit: 100,
          hourlyLimit: 20,
          warmupEnabled: false,
          sendWindowStart: '09:00',
          sendWindowEnd: '17:00',
          dkimStatus: 'pending',
          spfStatus: 'pending',
          dmarcStatus: 'pending',
          deliverabilityScore: 85,
          rotationRank: 0,
          providerConfig: encryptProviderConfig({ apiKey: resendKey }) as any,
        },
      });
      console.log(`[Outbound] Provisioned Resend sender for ${fromEmail}`);
    }
  }

  if ((await prisma.campaign.count()) === 0) {
    const leads = await prisma.lead.findMany({
      where: { emails: { some: { status: 'VALID' } } },
      take: 5,
      orderBy: { domainMatchScore: 'desc' },
    });

    await createCampaign(
      {
        name: 'Geo-domain buyer outreach',
        geoDomain: leads[0]?.taskId ? 'GeoDomain.com' : 'TexasCarVendor.com',
        niche: leads[0]?.category || 'local buyer',
        cityState: leads[0]?.location || 'United States',
        objective: 'Convert verified geo-domain leads into interested buyers',
        tone: 'professional',
        language: 'en',
        dailyLimit: 20,
        status: 'DRAFT',
        leadIds: leads.map((lead) => lead.id),
      },
      user.id
    );
  }

  return user;
}

export function startOutboundScheduler() {
  if (schedulerStarted) return;

  schedulerStarted = true;
  const intervalMs = Number(process.env.OUTBOUND_QUEUE_INTERVAL_MS || 30000);
  // Process the due-email queue IN-PROCESS on the web dyno. There is no separate
  // BullMQ worker dyno running in production (Procfile has only `web`), so relying
  // on enqueueOutboundQueueTick() would push jobs to Redis that nothing consumes —
  // follow-ups would queue forever and never send. Running the tick inline here
  // guarantees follow-ups go out regardless of whether a worker dyno exists.
  setInterval(() => {
    void processOutboundQueueTick().catch((error) => {
      console.error('[Outbound] Queue tick failed:', error);
    });
  }, intervalMs);
}

export async function enqueueOutboundQueueTick() {
  const repeatWindowMs = Number(process.env.OUTBOUND_QUEUE_INTERVAL_MS || 30000);
  const jobId = `outbound-tick-${Math.floor(Date.now() / repeatWindowMs)}`;

  try {
    await outboundQueue.add('process-due-email-logs', {}, { jobId });
    return { queued: true, workerQueue: 'bullmq', jobId };
  } catch (error) {
    console.error('[Outbound] Failed to enqueue outbound BullMQ job. Falling back to in-process tick.', error);
    return {
      queued: false,
      workerQueue: 'inline-fallback',
      result: await processOutboundQueueTick(),
    };
  }
}

export async function getOutboundOverview(userId: string) {
  await ensureOutboundSeedData();

  const [campaigns, senders, queued, replies, recentEvents, topLeads] = await Promise.all([
    prisma.campaign.findMany({
      where: { userId },
      orderBy: { updatedAt: 'desc' },
      take: 8,
      include: { campaignLeads: true, emailLogs: true, replies: true },
    }),
    prisma.senderAccount.findMany({ where: { userId }, orderBy: { createdAt: 'desc' } }),
    prisma.emailLog.count({ where: { status: 'QUEUED', campaign: { userId } } }),
    prisma.reply.findMany({
      where: { campaign: { userId } },
      orderBy: { receivedAt: 'desc' },
      take: 6,
      include: { lead: true, campaign: true },
    }),
    prisma.emailEvent.findMany({
      where: { campaign: { userId } },
      orderBy: { occurredAt: 'desc' },
      take: 12,
      include: { campaign: true },
    }),
    prisma.lead.findMany({
      where: { ownerId: userId },
      orderBy: { engagementScore: 'desc' },
      take: 8,
      include: {
        emails: {
          where: { status: 'VALID' },
          orderBy: { confidenceScore: 'desc' },
        },
      },
    }),
  ]);

  const campaignSummaries = campaigns.map(summarizeCampaign);
  const totals = campaignSummaries.reduce(
    (acc, campaign) => ({
      sent: acc.sent + campaign.sent,
      opens: acc.opens + campaign.opens,
      clicks: acc.clicks + campaign.clicks,
      replies: acc.replies + campaign.replies,
      bounces: acc.bounces + campaign.bounces,
      unsubscribes: acc.unsubscribes + campaign.unsubscribes,
    }),
    { sent: 0, opens: 0, clicks: 0, replies: 0, bounces: 0, unsubscribes: 0 }
  );

  return {
    metrics: {
      campaigns: campaigns.length,
      activeCampaigns: campaigns.filter((campaign) => campaign.status === 'ACTIVE').length,
      queued,
      sent: totals.sent,
      openRate: rate(totals.opens, totals.sent),
      clickRate: rate(totals.clicks, totals.sent),
      replyRate: rate(totals.replies, totals.sent),
      bounceRate: rate(totals.bounces, totals.sent),
      unsubscribeRate: rate(totals.unsubscribes, totals.sent),
    },
    campaigns: campaignSummaries,
    senders: senders.map(maskSenderAccount),
    replies: replies.map(formatReply),
    activity: recentEvents.map(formatEvent),
    topLeads: topLeads.map((lead) => ({
      id: lead.id,
      businessName: lead.businessName,
      website: lead.website,
      pipelineStage: lead.pipelineStage,
      engagementScore: lead.engagementScore,
      emails: lead.emails,
      tags: lead.tags,
    })),
    deliverabilityAlerts: buildDeliverabilityAlerts(senders, campaignSummaries),
  };
}

export async function listCampaigns(userId: string) {
  await ensureOutboundSeedData();
  const campaigns = await prisma.campaign.findMany({
    where: { userId },
    orderBy: { updatedAt: 'desc' },
    include: { campaignLeads: { include: { lead: true } }, emailLogs: true, replies: true, sequences: { include: { steps: true } } },
  });

  return campaigns.map(summarizeCampaign);
}

export async function getCampaignDetail(id: string, userId: string) {
  const campaign = await prisma.campaign.findFirst({
    where: { id, userId },
    include: {
      campaignLeads: {
        include: {
          lead: {
            include: {
              emails: { where: { status: 'VALID' }, orderBy: { confidenceScore: 'desc' } },
            },
          },
          emailLogs: true,
          replies: true,
        },
      },
      sequences: { include: { steps: { orderBy: { stepOrder: 'asc' } } } },
      emailLogs: true,
      replies: true,
    },
  });

  if (!campaign) return null;

  return {
    ...summarizeCampaign(campaign),
    sequences: campaign.sequences,
    leads: campaign.campaignLeads.map((item) => ({
      id: item.id,
      status: item.status,
      stage: item.stage,
      currentStep: item.currentStep,
      engagementScore: item.engagementScore,
      nextSendAt: item.nextSendAt,
      lead: item.lead,
      emailLogs: item.emailLogs,
      replies: item.replies,
    })),
  };
}

export async function createCampaign(input: CampaignCreateInput, userId?: string) {
  // When a domain is selected from the portfolio, derive campaign defaults
  // from it so the user doesn't re-type domain/niche/city for every campaign.
  // Explicit input values still win — the user can override per campaign.
  const domain = input.domainId
    ? await prisma.domain.findFirst({ where: { id: input.domainId, userId: userId ?? undefined } })
    : null;
  const geoDomain = input.geoDomain || domain?.name || 'example.com';
  const niche = input.niche || domain?.niche || domain?.industry || 'local business';
  const cityState = input.cityState
    || [domain?.city, domain?.state].filter(Boolean).join(', ')
    || domain?.state
    || undefined;

  const campaign = await prisma.campaign.create({
    data: {
      userId,
      domainId: domain?.id || null,
      name: input.name,
      objective: input.objective || (domain?.outreachStrategy ?? 'Sell or lease a geo domain to relevant local buyers'),
      geoDomain,
      niche,
      cityState,
      tone: input.tone || 'professional',
      language: input.language || 'en',
      status: input.status || 'DRAFT',
      dailyLimit: clamp(input.dailyLimit || 30, 1, 100),
      // Allow 0 = instant send (no spacing between recipients).
      smartDelayMin: clamp(input.smartDelayMin ?? 5, 0, 1440),
      smartDelayMax: clamp(input.smartDelayMax ?? input.smartDelayMin ?? 30, 0, 1440),
      // Instant campaigns open a 24/7 window so the scheduler never defers sends.
      sendWindowStart: input.instant ? '00:00' : '09:00',
      sendWindowEnd: input.instant ? '23:59' : '16:30',
      metadata: {
        compliance: defaultCompliancePolicy(),
        instant: !!input.instant,
        ...(input.senderAccountId ? { senderAccountId: input.senderAccountId } : {}),
      },
    },
  });

  // Bump the linked domain into the right pipeline stage when an outreach
  // campaign starts. The user can move it back manually if they want.
  if (domain && domain.status !== 'Sold' && domain.status !== 'Archived') {
    await prisma.domain.update({
      where: { id: domain.id },
      data: { status: domain.status === 'Available' ? 'Prospecting' : domain.status },
    });
  }

  const template = input.templateId
    ? await prisma.template.findUnique({ where: { id: input.templateId } }) || await ensureDefaultTemplate(userId)
    : await ensureDefaultTemplate(userId);
  const sequence = await prisma.sequence.create({
    data: {
      campaignId: campaign.id,
      name: 'Default 3-step respectful outreach',
      steps: {
        create: [
          {
            templateId: template.id,
            stepOrder: 1,
            delayHours: 0,
            stepType: 'INITIAL',
            subject: template.subject,
            previewText: template.previewText,
            body: template.body,
            useAI: true,
            stopOnReply: true,
          },
          {
            stepOrder: 2,
            delayHours: 72,
            stepType: 'FOLLOW_UP',
            subject: 'Following up on {{geoDomain}}',
            previewText: 'A quick follow-up on the domain idea.',
            body: 'Hi {{businessName}} team,\n\nFollowing up on {{geoDomain}}. It still looks like a relevant fit for {{niche}} visibility in {{cityState}}.\n\nShould I send the price and transfer details?\n\n{{unsubscribeLine}}',
            useAI: true,
            stopOnReply: true,
          },
          {
            stepOrder: 3,
            delayHours: 168,
            stepType: 'BREAKUP',
            subject: 'Closing the loop on {{geoDomain}}',
            previewText: 'Last note from me.',
            body: 'Hi {{businessName}} team,\n\nLast note from me on {{geoDomain}}. If this is not relevant, I will close the loop and avoid further follow-up.\n\n{{unsubscribeLine}}',
            useAI: true,
            stopOnReply: true,
          },
        ],
      },
    },
    include: { steps: true },
  });

  for (const leadId of input.leadIds || []) {
    await prisma.campaignLead
      .create({
        data: {
          campaignId: campaign.id,
          leadId,
          sequenceId: sequence.id,
          status: 'NEW',
          stage: 'New',
          trackingToken: randomToken(),
          unsubscribeToken: randomToken(),
          personalization: {},
        },
      })
      .catch(() => null);
  }

  // Handle uploaded emails by creating synthetic leads
  if (input.uploadedEmails && input.uploadedEmails.length > 0) {
    // Create a synthetic search task for uploaded emails
    const uploadTask = await prisma.searchTask.create({
      data: {
        keyword: `${input.name} - Uploaded Emails`,
        domainIdea: geoDomain,
        country: 'Unknown',
        cityState: input.cityState || 'Unknown',
        searchDepth: input.uploadedEmails.length,
        status: 'COMPLETED',
        progress: 100,
        totalLeads: input.uploadedEmails.length,
        validEmails: input.uploadedEmails.length,
      },
    });

    for (const email of input.uploadedEmails) {
      try {
        const lead = await prisma.lead.create({
          data: {
            taskId: uploadTask.id,
            businessName: email.split('@')[0],
            category: 'Uploaded',
            domainMatchScore: 50,
            scoreExplanation: 'Manually uploaded email',
            leadStatus: 'New',
            pipelineStage: 'New',
            summary: `Uploaded email: ${email}`,
            emails: {
              create: {
                email,
                status: 'VALID',
                confidenceScore: 0.9,
                sourcePage: 'CSV Upload',
                provider: 'unknown',
                mxValid: true,
                disposable: false,
                roleAccount: false,
                freeProvider: false,
                catchAllRisk: 'low',
                riskLevel: 'low',
                reputationScore: 90,
              },
            },
          },
        });
        await prisma.campaignLead.create({
          data: {
            campaignId: campaign.id,
            leadId: lead.id,
            sequenceId: sequence.id,
            status: 'NEW',
            stage: 'New',
            trackingToken: randomToken(),
            unsubscribeToken: randomToken(),
            personalization: {},
          },
        });
      } catch {
        // Skip duplicates or invalid emails
      }
    }
  }

  await writeAudit(userId, 'Campaign', campaign.id, 'CAMPAIGN_CREATED', {
    leadCount: (input.leadIds?.length || 0) + (input.uploadedEmails?.length || 0)
  });

  // Auto-generate variants so every campaign has A/B subject rotation
  try { await generateAndStoreVariants(campaign.id, userId); } catch { /* non-critical */ }

  return getCampaignDetail(campaign.id, userId as string);
}

export async function updateCampaignStatus(id: string, status: string, userId?: string) {
  if (userId) {
    const owned = await prisma.campaign.findFirst({ where: { id, userId }, select: { id: true } });
    if (!owned) throw new Error('Campaign not found.');
  }
  const campaign = await prisma.campaign.update({
    where: { id },
    data: {
      status,
      pausedAt: status === 'PAUSED' ? new Date() : null,
    },
  });

  if (status === 'ACTIVE') {
    // Generate variants if they don't exist yet
    const meta = (campaign.metadata as any) || {};
    if (!meta.variants) {
      try { await generateAndStoreVariants(id, userId); } catch { /* non-critical */ }
    }
    await queueCampaignSends(id);
  }

  await writeAudit(userId, 'Campaign', id, `CAMPAIGN_${status}`, {});
  broadcastOutboundEvent({ type: 'CAMPAIGN_STATUS', payload: { campaignId: id, status } });

  return campaign;
}

// Delete a campaign and everything that hangs off it (campaignLeads, emailLogs,
// replies, events, sequences, analytics all cascade via the schema). Synthetic
// "Uploaded" leads created just for this campaign are cleaned up too so they
// don't linger as orphans in the lead list.
export async function deleteCampaign(id: string, userId?: string) {
  const campaign = await prisma.campaign.findFirst({ where: { id, ...(userId ? { userId } : {}) } });
  if (!campaign) return { deleted: false };

  // Collect upload-only leads tied solely to this campaign before cascade.
  const uploadLeadIds = (
    await prisma.campaignLead.findMany({
      where: { campaignId: id, lead: { category: 'Uploaded' } },
      select: { leadId: true },
    })
  ).map((cl) => cl.leadId);

  await prisma.campaign.delete({ where: { id } });

  // Remove upload leads that are no longer referenced by any other campaign.
  for (const leadId of uploadLeadIds) {
    const stillUsed = await prisma.campaignLead.count({ where: { leadId } });
    if (stillUsed === 0) {
      await prisma.lead.delete({ where: { id: leadId } }).catch(() => undefined);
    }
  }

  await writeAudit(userId, 'Campaign', id, 'CAMPAIGN_DELETED', { name: campaign.name });
  broadcastOutboundEvent({ type: 'CAMPAIGN_DELETED', payload: { campaignId: id } });
  return { deleted: true };
}

// Per-variant performance for a campaign (sent/opens/replies), used to weight
// the variant rotation toward the best performers while still exploring others.
export interface VariantStat { sent: number; opens: number; replies: number; clicks: number }

export async function getVariantStats(campaignId: string): Promise<Record<string, VariantStat>> {
  const [sent, opens, clicks, replies] = await Promise.all([
    prisma.emailLog.groupBy({ by: ['variant'], where: { campaignId, variant: { not: null }, sentAt: { not: null } }, _count: { _all: true } }),
    prisma.emailLog.groupBy({ by: ['variant'], where: { campaignId, variant: { not: null }, openedAt: { not: null } }, _count: { _all: true } }),
    prisma.emailLog.groupBy({ by: ['variant'], where: { campaignId, variant: { not: null }, clickedAt: { not: null } }, _count: { _all: true } }),
    prisma.emailLog.groupBy({ by: ['variant'], where: { campaignId, variant: { not: null }, repliedAt: { not: null } }, _count: { _all: true } }),
  ]);
  const stats: Record<string, VariantStat> = {};
  const ensure = (k: string) => (stats[k] ??= { sent: 0, opens: 0, replies: 0, clicks: 0 });
  for (const r of sent) if (r.variant) ensure(r.variant).sent = r._count._all;
  for (const r of opens) if (r.variant) ensure(r.variant).opens = r._count._all;
  for (const r of clicks) if (r.variant) ensure(r.variant).clicks = r._count._all;
  for (const r of replies) if (r.variant) ensure(r.variant).replies = r._count._all;
  return stats;
}

// Build a weighted variant picker. Seeds every approved variant at least once
// (exploration), then biases selection toward variants with higher open/reply
// rates (exploitation). Returns null when no approved variants exist.
function buildVariantPicker(approved: GeneratedVariant[], stats: Record<string, VariantStat>) {
  if (approved.length === 0) return null;
  const weightFor = (v: GeneratedVariant) => {
    const s = stats[v.key];
    if (!s || s.sent < 3) return 1; // not enough data yet — neutral weight
    const openRate = s.sent ? s.opens / s.sent : 0;
    const replyRate = s.sent ? s.replies / s.sent : 0;
    return 1 + openRate * 2 + replyRate * 6; // replies weighted heaviest
  };
  return (indexInThisRun: number): GeneratedVariant => {
    // Seed phase: first N sends of this run go round-robin so each variant
    // that has never been sent gets initial coverage.
    const unseeded = approved.filter((v) => (stats[v.key]?.sent ?? 0) === 0);
    if (unseeded.length > 0 && indexInThisRun < unseeded.length) {
      return unseeded[indexInThisRun];
    }
    const weights = approved.map(weightFor);
    const total = weights.reduce((a, b) => a + b, 0);
    let r = Math.random() * total;
    for (let i = 0; i < approved.length; i++) {
      r -= weights[i];
      if (r <= 0) return approved[i];
    }
    return approved[indexInThisRun % approved.length];
  };
}

// Generate the 5 AI variants for a campaign and persist them on the campaign's
// metadata so the queue can rotate them. Returns the stored bundle.
export async function generateAndStoreVariants(campaignId: string, userId?: string) {
  const campaign = await prisma.campaign.findFirst({ where: { id: campaignId, ...(userId ? { userId } : {}) } });
  if (!campaign) throw new Error('Campaign not found.');

  const sender = await resolveCampaignSender(campaign);
  const bundle = await generateCampaignVariants({
    geoDomain: campaign.geoDomain,
    niche: campaign.niche,
    cityState: campaign.cityState || undefined,
    senderName: sender?.fromName || undefined,
    objective: campaign.objective,
    userId: campaign.userId,
  });

  await prisma.campaign.update({
    where: { id: campaign.id },
    data: { metadata: { ...(campaign.metadata as any), variants: bundle } as Prisma.InputJsonObject },
  });
  return bundle;
}

// Return the stored variants plus live performance, with best subject / variant
// / CTA highlighted. Powers the Variants panel in the UI.
export async function getCampaignVariants(campaignId: string, userId?: string) {
  const campaign = await prisma.campaign.findFirst({ where: { id: campaignId, ...(userId ? { userId } : {}) } });
  if (!campaign) throw new Error('Campaign not found.');

  const bundle = (campaign.metadata as any)?.variants as VariantBundle | undefined;
  const stats = await getVariantStats(campaign.id);

  const variants = (bundle?.variants || []).map((v) => {
    const s = stats[v.key] || { sent: 0, opens: 0, replies: 0, clicks: 0 };
    const openRate = s.sent ? Math.round((s.opens / s.sent) * 100) : 0;
    const replyRate = s.sent ? Math.round((s.replies / s.sent) * 100) : 0;
    const clickRate = s.sent ? Math.round((s.clicks / s.sent) * 100) : 0;
    return { ...v, performance: { ...s, openRate, replyRate, clickRate } };
  });

  // Best performers (require at least 1 send to qualify; fall back to first).
  const withSends = variants.filter((v) => v.performance.sent > 0);
  const bestByOpen = [...withSends].sort((a, b) => b.performance.openRate - a.performance.openRate)[0] || null;
  const bestByReply = [...withSends].sort((a, b) => b.performance.replyRate - a.performance.replyRate)[0] || null;

  return {
    generatedAt: bundle?.generatedAt || null,
    variants,
    best: {
      subject: bestByOpen ? { key: bestByOpen.key, subject: bestByOpen.subject, openRate: bestByOpen.performance.openRate } : null,
      variant: bestByReply ? { key: bestByReply.key, style: bestByReply.style, replyRate: bestByReply.performance.replyRate } : null,
      cta: bestByReply ? { key: bestByReply.key, cta: bestByReply.cta, replyRate: bestByReply.performance.replyRate } : null,
    },
  };
}

// Per-recipient open detail: who opened, which variant, how many times, and when.
export async function getCampaignRecipients(campaignId: string, userId?: string) {
  const campaign = await prisma.campaign.findFirst({ where: { id: campaignId, ...(userId ? { userId } : {}) }, select: { id: true } });
  if (!campaign) throw new Error('Campaign not found.');

  const logs = await prisma.emailLog.findMany({
    where: { campaignId: campaign.id },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      toEmail: true,
      subject: true,
      variant: true,
      status: true,
      sentAt: true,
      openedAt: true,
      clickedAt: true,
      repliedAt: true,
      lead: { select: { id: true, businessName: true } },
      _count: { select: { events: true } },
    },
  });

  // Count OPENED events per log (multiple opens = re-reads / forwards).
  const opens = await prisma.emailEvent.groupBy({
    by: ['emailLogId'],
    where: { campaignId: campaign.id, type: 'OPENED' },
    _count: { _all: true },
    _max: { occurredAt: true },
  });
  const openByLog = new Map(opens.map((o) => [o.emailLogId, { count: o._count._all, last: o._max.occurredAt }]));

  return logs.map((log) => {
    const o = openByLog.get(log.id);
    return {
      emailLogId: log.id,
      leadId: log.lead?.id,
      businessName: log.lead?.businessName || log.toEmail,
      toEmail: log.toEmail,
      subject: log.subject,
      variant: log.variant,
      status: log.status,
      sentAt: log.sentAt,
      openCount: o?.count ?? 0,
      firstOpenedAt: log.openedAt,
      lastOpenedAt: o?.last ?? log.openedAt,
      clicked: Boolean(log.clickedAt),
      replied: Boolean(log.repliedAt),
    };
  });
}

export async function queueCampaignSends(campaignId: string, senderAccountIdOverride?: string, userId?: string) {
  if (userId) {
    const owned = await prisma.campaign.findFirst({ where: { id: campaignId, userId }, select: { id: true } });
    if (!owned) throw new Error('Campaign not found.');
  }
  const campaign = await prisma.campaign.findUnique({
    where: { id: campaignId },
    include: {
      campaignLeads: {
        include: {
          lead: { include: { emails: { where: { status: 'VALID' }, orderBy: { confidenceScore: 'desc' } } } },
          emailLogs: true,
        },
      },
      sequences: { include: { steps: { orderBy: { stepOrder: 'asc' } } } },
    },
  });

  if (!campaign) return { queued: 0 };

  // An explicit override (from the Queue action) wins over the campaign's
  // stored choice; persist it so follow-ups use the same sender too.
  if (senderAccountIdOverride) {
    (campaign.metadata as any) = { ...(campaign.metadata as any), senderAccountId: senderAccountIdOverride };
    await prisma.campaign.update({
      where: { id: campaignId },
      data: { metadata: campaign.metadata as Prisma.InputJsonObject },
    });
  }
  const sender = await resolveCampaignSender(campaign);
  const firstStep = campaign.sequences[0]?.steps[0];
  if (!sender || !firstStep) return { queued: 0 };

  // Campaign Variant Engine: if approved variants are stored on the campaign,
  // rotate them across recipients (weighted toward best performers). Otherwise
  // fall back to local hardcoded variants so every send has subject rotation.
  let bundle = (campaign.metadata as any)?.variants as VariantBundle | undefined;
  if (!bundle) {
    bundle = { generatedAt: new Date().toISOString(), variants: localVariants({ geoDomain: campaign.geoDomain, niche: campaign.niche, cityState: campaign.cityState || undefined }) };
  }
  const approvedVariants = (bundle?.variants || []).filter((v) => v.approved);
  const variantStats = approvedVariants.length ? await getVariantStats(campaign.id) : {};
  const pickVariant = buildVariantPicker(approvedVariants, variantStats);

  const physicalAddress = await resolvePhysicalAddress(campaign.userId);
  let queued = 0;
  for (const recipient of campaign.campaignLeads) {
    if (recipient.emailLogs.length > 0) continue;
    if (recipient.lead.doNotContact || recipient.lead.unsubscribed) continue;

    const email = recipient.lead.emails[0]?.email;
    if (!email || (await isSuppressed(email))) continue;

    const scheduledAt = recipient.nextSendAt || nextSendTime(campaign, queued);
    const trackingToken = randomToken();
    const unsubscribeToken = recipient.unsubscribeToken || randomToken();

    // Choose the source copy: a rotated variant, or the step template.
    const chosen = pickVariant ? pickVariant(queued) : null;
    const rawBody = chosen ? chosen.body : firstStep.body;
    const rawSubject = chosen ? chosen.subject : firstStep.subject;

    const bodyText = personalize(rawBody, campaign, recipient.lead, {
      trackingToken,
      unsubscribeToken,
    }, physicalAddress);
    const subject = personalize(rawSubject, campaign, recipient.lead, {
      trackingToken,
      unsubscribeToken,
    }, physicalAddress, { isSubject: true });

    await prisma.emailLog.create({
      data: {
        campaignId: campaign.id,
        campaignLeadId: recipient.id,
        leadId: recipient.lead.id,
        senderAccountId: sender.id,
        templateId: firstStep.templateId,
        sequenceStepId: firstStep.id,
        provider: sender.provider,
        toEmail: email,
        fromEmail: sender.fromEmail,
        subject,
        variant: chosen ? chosen.key : null,
        previewText: firstStep.previewText,
        bodyText,
        bodyHtml: textToTrackedHtml(bodyText, trackingToken),
        status: 'QUEUED',
        trackingToken,
        unsubscribeToken,
        scheduledAt,
        metadata: {
          queueMode: process.env.OUTBOUND_QUEUE_MODE || 'database',
          compliance: defaultCompliancePolicy(),
          ...(chosen ? { variant: chosen.key, variantStyle: chosen.style } : {}),
        },
      },
    });

    await prisma.campaignLead.update({
      where: { id: recipient.id },
      data: { status: 'SCHEDULED', nextSendAt: scheduledAt, currentStep: 1 },
    });
    queued++;
  }

  broadcastOutboundEvent({ type: 'EMAILS_QUEUED', payload: { campaignId, queued } });

  // Instant campaigns shouldn't wait for the next ~30s scheduler tick — fire one
  // now. The tick still respects ACTIVE status, sender limits, and suppression.
  const instant = (campaign.metadata as any)?.instant;
  if (instant && queued > 0) {
    void processOutboundQueueTick().catch((err) => console.warn('[Outbound] instant tick failed:', err?.message));
  }
  return { queued };
}

export async function processOutboundQueueTick() {
  // Guard against overlapping runs: the recurring scheduler and the instant-send
  // path both call this. Two concurrent ticks would fetch the same QUEUED rows
  // before either marks them SENT, causing duplicate emails.
  if (tickInProgress) return { processed: 0, skipped: true };
  tickInProgress = true;
  try {
    return await runOutboundQueueTick();
  } finally {
    tickInProgress = false;
  }
}

async function runOutboundQueueTick() {
  const now = new Date();

  // Only pull logs whose campaign is ACTIVE. Past-due QUEUED logs from
  // paused/stopped campaigns would otherwise sort first (oldest scheduledAt) and
  // fill the batch window every tick, starving active campaigns' follow-ups.
  const dueLogs = await prisma.emailLog.findMany({
    where: {
      status: 'QUEUED',
      scheduledAt: { lte: now },
      campaign: { is: { status: 'ACTIVE' } },
    },
    take: 200,
    orderBy: { scheduledAt: 'asc' },
    include: {
      campaign: true,
      campaignLead: { include: { lead: true } },
      lead: true,
      senderAccount: true,
    },
  });

  // Fair-share the sender's limited daily quota across active campaigns:
  // interleave the due logs round-robin by campaign (each campaign kept
  // oldest-first) instead of strict global oldest-first. Otherwise one
  // campaign's large backlog of past-due follow-ups sorts first and consumes the
  // whole 100/day sender budget, starving the other active campaigns.
  const groups = new Map<string, typeof dueLogs>();
  for (const log of dueLogs) {
    const key = log.campaignId || 'none';
    const arr = groups.get(key);
    if (arr) arr.push(log); else groups.set(key, [log]);
  }
  const orderedLogs: typeof dueLogs = [];
  let progressed = true;
  while (progressed) {
    progressed = false;
    for (const arr of groups.values()) {
      const next = arr.shift();
      if (next) { orderedLogs.push(next); progressed = true; }
    }
  }

  // Senders that have hit their cap during this tick — skip further logs for them.
  const cappedSenders = new Set<string>();

  for (const log of orderedLogs) {
    if (log.campaign.status !== 'ACTIVE') continue;

    // The sender's DAILY limit is the single send cap: pull from all active
    // campaigns (round-robin above) until the sender's daily max is reached,
    // then stop. No per-campaign daily cap and no hourly throttle gate sends, so
    // the full daily budget is used continuously instead of stalling early.
    if (log.campaignLead?.status && ['REPLIED', 'INTERESTED', 'UNSUBSCRIBED', 'SUPPRESSED', 'COMPLETED'].includes(log.campaignLead.status)) {
      await prisma.emailLog.update({
        where: { id: log.id },
        data: { status: 'CANCELLED', errorMessage: `Sequence stopped because the lead is ${log.campaignLead.status.toLowerCase()}.` },
      });
      continue;
    }
    if (log.lead.doNotContact || log.lead.unsubscribed || (await isSuppressed(log.toEmail))) {
      await prisma.emailLog.update({
        where: { id: log.id },
        data: { status: 'UNSUBSCRIBED', unsubscribedAt: now, errorMessage: 'Lead is suppressed or unsubscribed.' },
      });
      continue;
    }

    // Pre-send freshness: re-check DNS if email was verified > 7 days ago
    const staleThreshold = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const leadEmail = await prisma.leadEmail.findFirst({
      where: { email: log.toEmail, leadId: log.leadId },
      orderBy: { verifiedAt: 'desc' },
    });
    if (leadEmail && (!leadEmail.verifiedAt || leadEmail.verifiedAt < staleThreshold)) {
      const domain = log.toEmail.split('@')[1];
      if (domain) {
        try {
          const mxRecords = await Promise.race([
            resolveMx(domain),
            new Promise<never>((_, reject) => setTimeout(() => reject(new Error('timeout')), 3000)),
          ]);
          if (!mxRecords || mxRecords.length === 0) {
            await prisma.emailLog.update({
              where: { id: log.id },
              data: { status: 'CANCELLED', errorMessage: 'Domain no longer has MX records (re-verified before send).' },
            });
            continue;
          }
        } catch {
          // DNS check failed — proceed cautiously, don't block send
        }
      }
    }

    const sender = log.senderAccount || (await getRotatedSender());
    if (!sender) continue;
    // Once a sender has hit its hourly/daily cap, remember it so we don't run two
    // count queries for every remaining log in this (now larger) batch.
    if (cappedSenders.has(sender.id)) continue;
    if (!(await senderWithinLimits(sender.id, sender.hourlyLimit, sender.dailyLimit))) {
      cappedSenders.add(sender.id);
      continue;
    }

    try {
      const providerResponse = await sendWithRetry(log, sender);
      const wasDryRun = !!providerResponse.dryRun;
      await prisma.emailLog.update({
        where: { id: log.id },
        data: {
          status: wasDryRun ? 'SIMULATED' : 'SENT',
          sentAt: new Date(),
          providerMessageId: providerResponse.providerMessageId,
          metadata: {
            ...(log.metadata as Record<string, unknown> | null),
            providerResponse,
            dryRun: wasDryRun,
          } as Prisma.InputJsonObject,
        },
      });
      await prisma.lead.update({
        where: { id: log.leadId },
        data: {
          leadStatus: 'Contacted',
          pipelineStage: 'Contacted',
          lastContactedAt: new Date(),
          engagementScore: { increment: 8 },
        },
      });
      if (log.campaignLeadId) {
        await prisma.campaignLead.update({
          where: { id: log.campaignLeadId },
          data: { status: 'SENT', stage: 'Contacted', lastSentAt: new Date(), attemptCount: { increment: 1 } },
        });
      }
      await recordEmailEvent(log.id, 'SENT', { providerResponse });
      await queueNextSequenceStep(log.id);
    } catch (error: any) {
      await prisma.emailLog.update({
        where: { id: log.id },
        data: { status: 'FAILED', errorMessage: error.message },
      });
      await recordEmailEvent(log.id, 'FAILED', { error: error.message });
    }
  }

  return { processed: dueLogs.length };
}

async function queueNextSequenceStep(emailLogId: string) {
  const log = await prisma.emailLog.findUnique({
    where: { id: emailLogId },
    include: {
      campaign: true,
      campaignLead: {
        include: {
          lead: { include: { emails: { where: { status: 'VALID' }, orderBy: { confidenceScore: 'desc' } } } },
          sequence: { include: { steps: { orderBy: { stepOrder: 'asc' } } } },
          replies: true,
        },
      },
    },
  });

  if (!log?.campaignLead?.sequence) return null;

  const campaignLead = log.campaignLead;
  const sequence = campaignLead.sequence!;
  const currentStep = log.sequenceStepId
    ? sequence.steps.find((step) => step.id === log.sequenceStepId)
    : sequence.steps.find((step) => step.stepOrder === campaignLead.currentStep);
  const nextStep = sequence.steps.find((step) => step.stepOrder > (currentStep?.stepOrder || campaignLead.currentStep));

  if (!nextStep) {
    await prisma.campaignLead.update({
      where: { id: campaignLead.id },
      data: { status: 'COMPLETED', stage: campaignLead.stage },
    });
    return null;
  }

  if (currentStep?.stopOnReply && campaignLead.replies.length > 0) {
    await prisma.campaignLead.update({
      where: { id: campaignLead.id },
      data: { status: 'REPLIED', stage: campaignLead.positiveReply ? 'Interested' : 'Replied', pausedReason: 'Reply received.' },
    });
    return null;
  }

  if (campaignLead.lead.doNotContact || campaignLead.lead.unsubscribed || (await isSuppressed(log.toEmail))) {
    await prisma.campaignLead.update({
      where: { id: campaignLead.id },
      data: { status: 'SUPPRESSED', pausedReason: 'Lead is unsubscribed or suppressed.' },
    });
    return null;
  }

  const existingNextLog = await prisma.emailLog.findFirst({
    where: {
      campaignLeadId: campaignLead.id,
      sequenceStepId: nextStep.id,
      status: { in: ['QUEUED', 'SENT', 'DELIVERED', 'OPENED', 'CLICKED', 'REPLIED'] },
    },
  });
  if (existingNextLog) return existingNextLog;

  const sender = await getRotatedSender();
  const toEmail = campaignLead.lead.emails[0]?.email || log.toEmail;
  if (!sender || !toEmail) return null;

  const trackingToken = randomToken();
  const unsubscribeToken = campaignLead.unsubscribeToken || log.unsubscribeToken || randomToken();

  // Smart follow-up timing: adjust delay based on engagement
  let adjustedDelayHours = nextStep.delayHours;
  const openCount = campaignLead.lead.openCount || 0;
  const lastOpenedAt = log.openedAt || campaignLead.openedAt;
  if (nextStep.stepType === 'FOLLOW_UP') {
    if (openCount >= 3 && lastOpenedAt) {
      // Engaged lead — follow up sooner (24-48h)
      adjustedDelayHours = 24;
    } else if (openCount === 0) {
      // Never opened — wait longer before following up
      adjustedDelayHours = Math.max(nextStep.delayHours, 120);
    }
  }
  const scheduledAt = nextSequenceSendTime(adjustedDelayHours, log.sentAt || new Date(), log.campaign);
  const physicalAddress = await resolvePhysicalAddress(log.campaign?.userId);

  let stepBody = nextStep.body;
  let stepSubject = nextStep.subject;
  let fuVariant: string | null = null;
  if (nextStep.useAI && nextStep.stepType !== 'INITIAL') {
    // If the initial email used a variant, pass its style to the follow-up AI
    const prevVariant = (log.metadata as any)?.variant;
    const aiResult = await generateFollowUpBody({
      businessName: campaignLead.lead.businessName,
      senderName: sender.fromName,
      geoDomain: log.campaign?.geoDomain || '',
      niche: log.campaign?.niche,
      cityState: log.campaign?.cityState ?? undefined,
      website: campaignLead.lead.website ?? undefined,
      stepOrder: nextStep.stepOrder,
      stepType: nextStep.stepType,
      userId: log.campaign?.userId,
      decisionMakerName: campaignLead.lead.decisionMakerName ?? undefined,
      decisionMakerRole: campaignLead.lead.decisionMakerRole ?? undefined,
    }).catch(() => null);
    if (aiResult) {
      stepBody = aiResult.body;
      stepSubject = aiResult.subject;
      fuVariant = prevVariant || null;
    }
  }

  const bodyText = personalize(stepBody, log.campaign, campaignLead.lead, { trackingToken, unsubscribeToken }, physicalAddress);
  const subject = personalize(stepSubject, log.campaign, campaignLead.lead, { trackingToken, unsubscribeToken }, physicalAddress, { isSubject: true });

  const nextLog = await prisma.emailLog.create({
    data: {
      campaignId: log.campaignId,
      campaignLeadId: campaignLead.id,
      leadId: campaignLead.leadId,
      senderAccountId: sender.id,
      templateId: nextStep.templateId,
      sequenceStepId: nextStep.id,
      provider: sender.provider,
      toEmail,
      fromEmail: sender.fromEmail,
      subject,
      previewText: nextStep.previewText,
      // Carry the initial email's variant onto the follow-up so variant
      // performance stats include follow-up opens/replies, not just first sends.
      variant: fuVariant,
      bodyText,
      bodyHtml: textToTrackedHtml(bodyText, trackingToken),
      status: 'QUEUED',
      trackingToken,
      unsubscribeToken,
      scheduledAt,
      metadata: {
        queueMode: process.env.OUTBOUND_QUEUE_MODE || 'database',
        compliance: defaultCompliancePolicy(),
        sequenceStep: nextStep.stepOrder,
        ...(fuVariant ? { variant: fuVariant } : {}),
      },
    },
  });

  await prisma.campaignLead.update({
    where: { id: campaignLead.id },
    data: { status: 'SCHEDULED', nextSendAt: scheduledAt, currentStep: nextStep.stepOrder },
  });

  await recordEmailEvent(nextLog.id, 'FOLLOW_UP_QUEUED', { stepOrder: nextStep.stepOrder, scheduledAt });
  return nextLog;
}

function nextSequenceSendTime(delayHours: number, reference: Date, campaign: any) {
  const base = new Date(reference.getTime() + Math.max(0, delayHours) * 60 * 60 * 1000);
  const windowStart = campaign.sendWindowStart || '09:00';
  const windowEnd = campaign.sendWindowEnd || '16:30';
  const start = parseTimeToMinutes(windowStart);
  const end = parseTimeToMinutes(windowEnd);

  if (!start || !end) {
    return base;
  }

  const adjusted = new Date(base);
  const minutes = adjusted.getHours() * 60 + adjusted.getMinutes();
  if (minutes < start) {
    adjusted.setHours(Math.floor(start / 60), start % 60, 0, 0);
  } else if (minutes > end) {
    adjusted.setDate(adjusted.getDate() + 1);
    adjusted.setHours(Math.floor(start / 60), start % 60, 0, 0);
  }

  return adjusted;
}

function parseTimeToMinutes(value: string) {
  const [hours, minutes] = value.split(':').map((part) => Number(part));
  if (Number.isFinite(hours) && Number.isFinite(minutes)) {
    return hours * 60 + minutes;
  }
  return 0;
}

export async function listTemplates(userId: string) {
  await ensureOutboundSeedData();
  return prisma.template.findMany({ where: { isArchived: false, userId }, orderBy: { updatedAt: 'desc' } });
}

export async function saveTemplate(input: TemplateInput, userId?: string) {
  return prisma.template.create({
    data: {
      userId,
      name: input.name,
      type: input.type || 'cold',
      purpose: input.purpose || input.type || 'cold',
      language: input.language || 'en',
      tone: input.tone || 'professional',
      subject: input.subject,
      previewText: input.previewText,
      body: input.body,
      tags: input.tags || [],
      spamScore: scoreSpamRisk(`${input.subject}\n${input.body}`),
      deliverabilityScore: Math.max(0, 100 - scoreSpamRisk(`${input.subject}\n${input.body}`) * 7),
      variables: {
        required: ['businessName', 'geoDomain', 'cityState', 'niche', 'unsubscribeUrl'],
      },
    },
  });
}

export async function listSenderAccounts(userId: string) {
  await ensureOutboundSeedData();
  const senders = await prisma.senderAccount.findMany({ where: { userId }, orderBy: [{ status: 'asc' }, { createdAt: 'desc' }] });
  return senders.map(maskSenderAccount);
}

export async function saveSenderAccount(input: SenderAccountInput, userId?: string) {
  const encryptedConfig = input.providerConfig ? encryptProviderConfig(input.providerConfig) : undefined;
  return prisma.senderAccount.create({
    data: {
      userId,
      label: input.label,
      provider: input.provider,
      fromName: input.fromName,
      fromEmail: input.fromEmail,
      replyTo: input.replyTo,
      status: input.status || 'active',
      timezone: input.timezone || 'UTC',
      dailyLimit: clamp(input.dailyLimit || 100, 1, 100),
      hourlyLimit: clamp(input.hourlyLimit || 20, 1, 200),
      providerConfig: encryptedConfig as Prisma.InputJsonObject | undefined,
      dkimStatus: 'pending',
      spfStatus: 'pending',
      dmarcStatus: 'pending',
      deliverabilityScore: 70,
    },
  });
}

export async function verifySenderAccount(id: string, userId?: string) {
  const sender = await prisma.senderAccount.findUnique({ where: { id } });
  if (!sender) {
    return null;
  }

  const domain = extractEmailDomain(sender.fromEmail);
  if (!domain) {
    throw new Error('Sender fromEmail must contain a valid domain.');
  }

  const config = decryptProviderConfig(sender.providerConfig as Record<string, unknown> | null);
  const dkimSelector = asString(config.dkimSelector) || asString(config.selector) || asString(config.dkimSelectorName);

  const [spfRecords, dmarcRecords, dkimRecords] = await Promise.all([
    readTxtRecords(domain),
    readTxtRecords(`_dmarc.${domain}`),
    dkimSelector ? readTxtRecords(`${dkimSelector}._domainkey.${domain}`) : Promise.resolve([]),
  ]);

  const spfStatus = spfRecords.some((record) => /^v=spf1\b/i.test(record)) ? 'verified' : 'missing';
  const dmarcStatus = dmarcRecords.some((record) => /^v=dmarc1\b/i.test(record)) ? 'verified' : 'missing';
  const dkimStatus = !dkimSelector
    ? 'pending'
    : dkimRecords.some((record) => /^v=dkim1\b/i.test(record) || /p=/i.test(record))
      ? 'verified'
      : 'missing';
  const deliverabilityScore = clamp(
    35 +
      (spfStatus === 'verified' ? 20 : 0) +
      (dkimStatus === 'verified' ? 25 : 0) +
      (dmarcStatus === 'verified' ? 20 : 0) -
      Math.round(sender.bounceRate * 300) -
      Math.round(sender.spamComplaintRate * 2000),
    0,
    100
  );

  const updated = await prisma.senderAccount.update({
    where: { id },
    data: {
      spfStatus,
      dkimStatus,
      dmarcStatus,
      deliverabilityScore,
      lastVerifiedAt: new Date(),
    },
  });

  await writeAudit(userId, 'SenderAccount', id, 'SENDER_DNS_VERIFIED', {
    domain,
    spfStatus,
    dkimStatus,
    dmarcStatus,
  });

  return {
    sender: maskSenderAccount(updated),
    verification: {
      domain,
      spfStatus,
      dkimStatus,
      dmarcStatus,
      deliverabilityScore,
      records: {
        spf: spfRecords,
        dkim: dkimRecords,
        dmarc: dmarcRecords,
      },
    } satisfies SenderVerificationResult,
  };
}

export async function updateLeadCrm(id: string, input: Record<string, unknown>, userId?: string) {
  if (userId) {
    const owned = await prisma.lead.findFirst({ where: { id, ownerId: userId }, select: { id: true } });
    if (!owned) throw new Error('Lead not found.');
  }
  return prisma.lead.update({
    where: { id },
    data: {
      leadStatus: asString(input.leadStatus),
      pipelineStage: asString(input.pipelineStage),
      tags: Array.isArray(input.tags) ? input.tags.map(String) : undefined,
      notes: asString(input.notes),
      reminderAt: input.reminderAt ? new Date(String(input.reminderAt)) : undefined,
      nextFollowUpAt: input.nextFollowUpAt ? new Date(String(input.nextFollowUpAt)) : undefined,
      doNotContact: typeof input.doNotContact === 'boolean' ? input.doNotContact : undefined,
    },
  });
}

export async function listAuditLogs(limit = 25) {
  await ensureOutboundSeedData();
  const logs = await prisma.auditLog.findMany({
    orderBy: { createdAt: 'desc' },
    take: clamp(limit, 1, 100),
    include: { user: true },
  });

  return logs.map((log) => ({
    id: log.id,
    entityType: log.entityType,
    entityId: log.entityId,
    action: log.action,
    payload: log.payload,
    createdAt: log.createdAt,
    user: log.user
      ? {
          id: log.user.id,
          name: log.user.name,
          email: log.user.email,
          role: log.user.role,
        }
      : null,
  }));
}

export async function listWebhookEvents(limit = 25) {
  const events = await prisma.webhookEvent.findMany({
    orderBy: { createdAt: 'desc' },
    take: clamp(limit, 1, 100),
  });

  return events.map((event) => ({
    id: event.id,
    provider: event.provider,
    type: event.type,
    externalId: event.externalId,
    processed: event.processed,
    createdAt: event.createdAt,
    summary: summarizeWebhookPayload(event.payload),
  }));
}

export async function listSuppressionEntries(limit = 25) {
  const entries = await prisma.suppressionEntry.findMany({
    orderBy: { createdAt: 'desc' },
    take: clamp(limit, 1, 100),
  });

  return entries.map((entry) => ({
    id: entry.id,
    email: entry.email,
    reason: entry.reason,
    source: entry.source,
    campaignId: entry.campaignId,
    leadId: entry.leadId,
    createdAt: entry.createdAt,
    updatedAt: entry.updatedAt,
  }));
}

export async function addSuppressionEntry(
  input: {
    email: string;
    reason?: string;
    source?: string;
    campaignId?: string;
    leadId?: string;
  },
  userId?: string
) {
  const email = input.email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error('A valid email address is required for suppression.');
  }

  const matchingEmails = await prisma.leadEmail.findMany({
    where: { email: { equals: email, mode: 'insensitive' } },
    select: { leadId: true },
  });
  const leadIds = Array.from(new Set([input.leadId, ...matchingEmails.map((item) => item.leadId)].filter(Boolean))) as string[];

  const entry = await prisma.suppressionEntry.upsert({
    where: { email },
    update: {
      reason: input.reason || 'manual',
      source: input.source || 'manual',
      campaignId: input.campaignId,
      leadId: leadIds[0],
    },
    create: {
      email,
      reason: input.reason || 'manual',
      source: input.source || 'manual',
      campaignId: input.campaignId,
      leadId: leadIds[0],
    },
  });

  if (leadIds.length > 0) {
    await prisma.lead.updateMany({
      where: { id: { in: leadIds } },
      data: { doNotContact: true, pipelineStage: 'Suppressed', leadStatus: 'Suppressed' },
    });
  }

  await writeAudit(userId, 'SuppressionEntry', entry.id, 'SUPPRESSION_ADDED', {
    email,
    reason: entry.reason,
    matchedLeads: leadIds.length,
  });

  return {
    id: entry.id,
    email: entry.email,
    reason: entry.reason,
    source: entry.source,
    campaignId: entry.campaignId,
    leadId: entry.leadId,
    createdAt: entry.createdAt,
    updatedAt: entry.updatedAt,
    matchedLeads: leadIds.length,
  };
}

// A reply belongs to a user if it landed in their mailbox, is tied to their
// campaign, or is matched to a lead they own.
function replyOwnershipWhere(userId: string) {
  return { OR: [{ mailbox: { userId } }, { campaign: { userId } }, { lead: { ownerId: userId } }] };
}

export async function listInbox(userId: string) {
  await ensureOutboundSeedData();
  const replies = await prisma.reply.findMany({
    where: replyOwnershipWhere(userId),
    orderBy: { receivedAt: 'desc' },
    include: { lead: true, campaign: true, emailLog: true },
    take: 50,
  });
  return replies.map(formatReply);
}

export async function getReplyThread(id: string, userId: string) {
  const reply = await prisma.reply.findFirst({
    where: { id, ...replyOwnershipWhere(userId) },
    include: { lead: true, campaign: true, campaignLead: true, emailLog: true },
  });

  if (!reply) return null;

  const threadWhere = reply.campaignLeadId
    ? { campaignLeadId: reply.campaignLeadId }
    : { campaignId: reply.campaignId, leadId: reply.leadId };

  const [emailLogs, replies] = await Promise.all([
    prisma.emailLog.findMany({
      where: threadWhere,
      orderBy: { createdAt: 'asc' },
      include: {
        events: { orderBy: { occurredAt: 'asc' } },
        senderAccount: true,
      },
    }),
    prisma.reply.findMany({
      where: threadWhere,
      orderBy: { receivedAt: 'asc' },
      include: { lead: true, campaign: true },
    }),
  ]);

  const emailLogIds = emailLogs.map((log) => log.id);
  const eventWhere = reply.campaignLeadId
    ? {
        OR: [
          { campaignLeadId: reply.campaignLeadId },
          emailLogIds.length > 0 ? { emailLogId: { in: emailLogIds } } : { id: '__none__' },
        ],
      }
    : emailLogIds.length > 0
      ? { emailLogId: { in: emailLogIds } }
      : { id: '__none__' };
  const events = await prisma.emailEvent.findMany({
    where: eventWhere,
    orderBy: { occurredAt: 'asc' },
    include: { campaign: true },
  });

  const messages = [
    ...emailLogs.map((log) => ({
      id: log.id,
      kind: 'outbound',
      subject: log.subject,
      body: log.bodyText,
      status: log.status,
      occurredAt: log.sentAt || log.scheduledAt || log.createdAt,
      fromEmail: log.fromEmail,
      toEmail: log.toEmail,
      provider: log.provider,
      sequenceStepId: log.sequenceStepId,
      events: log.events.map(formatEvent),
    })),
    ...replies.map((item) => ({
      id: item.id,
      kind: 'reply',
      subject: item.subject,
      body: item.body,
      status: item.status,
      occurredAt: item.receivedAt,
      fromEmail: item.fromEmail,
      toEmail: null,
      sentiment: item.sentiment,
      intentScore: item.intentScore,
      buyingIntent: item.buyingIntent,
      events: [],
    })),
  ].sort((a, b) => new Date(a.occurredAt).getTime() - new Date(b.occurredAt).getTime());

  return {
    reply: formatReply(reply),
    campaign: {
      id: reply.campaign.id,
      name: reply.campaign.name,
      geoDomain: reply.campaign.geoDomain,
      niche: reply.campaign.niche,
      status: reply.campaign.status,
    },
    lead: {
      id: reply.lead.id,
      businessName: reply.lead.businessName,
      website: reply.lead.website,
      leadStatus: reply.lead.leadStatus,
      pipelineStage: reply.lead.pipelineStage,
      engagementScore: reply.lead.engagementScore,
      reminderAt: reply.lead.reminderAt,
      nextFollowUpAt: reply.lead.nextFollowUpAt,
      tags: reply.lead.tags,
      doNotContact: reply.lead.doNotContact,
    },
    messages,
    events: events.map(formatEvent),
  };
}

export async function applyInboxAction(
  id: string,
  input: { action?: string; reminderAt?: string },
  userId?: string
) {
  const reply = await prisma.reply.findFirst({
    where: { id, ...(userId ? replyOwnershipWhere(userId) : {}) },
    include: { lead: true, campaignLead: true },
  });

  if (!reply) return null;

  const action = normalizeInboxAction(input.action);
  const leadData: Record<string, unknown> = {};
  const campaignLeadData: Record<string, unknown> = {};
  let replyStatus = reply.status;
  let stopReason = '';

  if (action === 'mark_read') {
    replyStatus = 'READ';
  }

  if (action === 'mark_interested') {
    replyStatus = 'ACTIONED';
    leadData.leadStatus = 'Interested';
    leadData.pipelineStage = 'Interested';
    leadData.tags = mergeTags(reply.lead.tags, ['intent:buyer']);
    campaignLeadData.status = 'INTERESTED';
    campaignLeadData.stage = 'Interested';
    campaignLeadData.engaged = true;
    campaignLeadData.positiveReply = true;
    stopReason = 'Sequence stopped after inbox action: interested.';
  }

  if (action === 'mark_not_interested') {
    replyStatus = 'CLOSED';
    leadData.leadStatus = 'Not Interested';
    leadData.pipelineStage = 'Not Interested';
    leadData.doNotContact = true;
    leadData.tags = mergeTags(reply.lead.tags, ['not-interested']);
    campaignLeadData.status = 'SUPPRESSED';
    campaignLeadData.stage = 'Not Interested';
    campaignLeadData.negativeReply = true;
    campaignLeadData.pausedReason = 'Lead marked not interested from inbox.';
    stopReason = 'Sequence stopped after inbox action: not interested.';
  }

  if (action === 'create_reminder') {
    const reminderAt = input.reminderAt ? new Date(input.reminderAt) : new Date(Date.now() + 2 * 24 * 60 * 60 * 1000);
    replyStatus = 'NEEDS_FOLLOW_UP';
    leadData.reminderAt = reminderAt;
    leadData.nextFollowUpAt = reminderAt;
    leadData.tags = mergeTags(reply.lead.tags, ['needs-follow-up']);
  }

  if (action === 'send_to_negotiation') {
    replyStatus = 'ACTIONED';
    leadData.leadStatus = 'Negotiating';
    leadData.pipelineStage = 'Negotiating';
    leadData.tags = mergeTags(reply.lead.tags, ['deal:negotiating']);
    campaignLeadData.status = 'INTERESTED';
    campaignLeadData.stage = 'Negotiating';
    campaignLeadData.engaged = true;
    campaignLeadData.positiveReply = true;
  }

  if (action === 'archive') {
    replyStatus = 'ARCHIVED';
  }

  const updates: Promise<unknown>[] = [
    prisma.reply.update({
      where: { id },
      data: { status: replyStatus },
    }),
  ];

  if (Object.keys(leadData).length > 0) {
    updates.push(prisma.lead.update({ where: { id: reply.leadId }, data: leadData }));
  }

  if (reply.campaignLeadId && Object.keys(campaignLeadData).length > 0) {
    updates.push(prisma.campaignLead.update({ where: { id: reply.campaignLeadId }, data: campaignLeadData }));
  }

  if (reply.campaignLeadId && stopReason) {
    updates.push(stopQueuedFollowUps(reply.campaignLeadId, stopReason));
  }

  await Promise.all(updates);
  await writeAudit(userId, 'Reply', id, `INBOX_${action.toUpperCase()}`, { action });

  return getReplyThread(id, userId as string);
}

export async function ingestReply(input: {
  campaignLeadId?: string;
  emailLogId?: string;
  fromEmail: string;
  subject: string;
  body: string;
}) {
  const emailLog = input.emailLogId
    ? await prisma.emailLog.findUnique({ where: { id: input.emailLogId }, include: { campaignLead: true } })
    : null;
  const campaignLead = input.campaignLeadId
    ? await prisma.campaignLead.findUnique({ where: { id: input.campaignLeadId } })
    : emailLog?.campaignLead || null;

  if (!campaignLead && !emailLog) {
    throw new Error('Reply must include a campaignLeadId or emailLogId.');
  }

  const classification = classifyReply(input.body);
  const reply = await prisma.reply.create({
    data: {
      campaignId: campaignLead?.campaignId || emailLog!.campaignId,
      campaignLeadId: campaignLead?.id,
      leadId: campaignLead?.leadId || emailLog!.leadId,
      emailLogId: emailLog?.id,
      fromEmail: input.fromEmail,
      subject: input.subject,
      body: input.body,
      sentiment: classification.sentiment,
      intentScore: classification.intentScore,
      buyingIntent: classification.buyingIntent,
      status: 'NEW',
      suggestedResponse: buildReplySuggestion(input.body, classification),
      tags: classification.tags,
    },
  });

  if (campaignLead) {
    await prisma.campaignLead.update({
      where: { id: campaignLead.id },
      data: {
        status: classification.buyingIntent ? 'INTERESTED' : 'REPLIED',
        stage: classification.buyingIntent ? 'Interested' : 'Replied',
        repliedAt: new Date(),
        engaged: true,
        positiveReply: classification.sentiment === 'positive',
        negativeReply: classification.sentiment === 'negative',
        engagementScore: { increment: classification.buyingIntent ? 40 : 20 },
      },
    });
  }

  await prisma.lead.update({
    where: { id: campaignLead?.leadId || emailLog!.leadId },
    data: {
      leadStatus: classification.buyingIntent ? 'Interested' : 'Replied',
      pipelineStage: classification.buyingIntent ? 'Interested' : 'Replied',
      replyCount: { increment: 1 },
      engagementScore: { increment: classification.buyingIntent ? 40 : 20 },
      lastContactedAt: new Date(),
    },
  });

  const repliedCampaignLeadId = campaignLead?.id || emailLog?.campaignLeadId;
  if (repliedCampaignLeadId) {
    await prisma.emailLog.updateMany({
      where: {
        campaignLeadId: repliedCampaignLeadId,
        status: 'QUEUED',
      },
      data: {
        status: 'CANCELLED',
        errorMessage: 'Sequence stopped after reply.',
      },
    });
  }

  await recordEmailEvent(emailLog?.id, 'REPLIED', { replyId: reply.id });
  return reply;
}

// Resend Inbound webhook handler. Resend POSTs parsed inbound mail when an MX
// record points at their service and a webhook is configured. We match the
// inbound mail back to the original outbound EmailLog via the In-Reply-To
// header (Resend's Message-ID format embeds our providerMessageId UUID), with
// a recipient-address fallback for older threads.
export async function handleResendInbound(payload: any) {
  const data = payload?.data || payload;
  if (!data) {
    return { processed: false, reason: 'no data' };
  }

  const fromEmail = extractEmail(data.from);
  const subject = String(data.subject || '(no subject)').slice(0, 500);
  const body = String(data.text || stripHtml(data.html) || '').slice(0, 50000);
  if (!fromEmail) {
    return { processed: false, reason: 'no from address' };
  }

  const headers = normalizeHeaders(data.headers);
  const inReplyTo: string = headers['in-reply-to'] || data.in_reply_to || '';
  const references: string = headers['references'] || (Array.isArray(data.references) ? data.references.join(' ') : data.references || '');
  const candidateIds = extractMessageIds(`${inReplyTo} ${references}`);

  let emailLog: any = null;
  for (const candidate of candidateIds) {
    emailLog = await prisma.emailLog.findFirst({ where: { providerMessageId: candidate } });
    if (emailLog) break;
  }
  if (!emailLog) {
    emailLog = await prisma.emailLog.findFirst({
      where: { toEmail: fromEmail.toLowerCase() },
      orderBy: { sentAt: 'desc' },
    });
  }
  if (!emailLog) {
    console.warn(`[ResendInbound] No matching EmailLog for ${fromEmail} (inReplyTo=${inReplyTo})`);
    return { processed: false, reason: 'no matching outbound message' };
  }

  const reply = await ingestReply({
    emailLogId: emailLog.id,
    campaignLeadId: emailLog.campaignLeadId || undefined,
    fromEmail,
    subject,
    body,
  });
  return { processed: true, replyId: reply.id };
}

function extractEmail(input: any): string {
  if (!input) return '';
  if (typeof input === 'string') {
    const match = input.match(/<([^>]+)>/);
    return (match ? match[1] : input).trim().toLowerCase();
  }
  if (Array.isArray(input)) return extractEmail(input[0]);
  if (typeof input === 'object' && input.email) return String(input.email).toLowerCase();
  return '';
}

function normalizeHeaders(input: any): Record<string, string> {
  const out: Record<string, string> = {};
  if (!input) return out;
  if (Array.isArray(input)) {
    for (const h of input) {
      if (h?.name) out[String(h.name).toLowerCase()] = String(h.value || '');
    }
  } else if (typeof input === 'object') {
    for (const [k, v] of Object.entries(input)) out[k.toLowerCase()] = String(v ?? '');
  }
  return out;
}

function extractMessageIds(text: string): string[] {
  const ids = new Set<string>();
  const uuidRe = /([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})/g;
  let m: RegExpExecArray | null;
  while ((m = uuidRe.exec(text)) !== null) ids.add(m[1].toLowerCase());
  // Also try the raw local-part of any <token@host> for non-UUID providerMessageIds.
  const localRe = /<([^@>\s]+)@[^>]+>/g;
  while ((m = localRe.exec(text)) !== null) ids.add(m[1]);
  return Array.from(ids);
}

function stripHtml(html: any): string {
  if (!html || typeof html !== 'string') return '';
  return html.replace(/<style[\s\S]*?<\/style>/gi, '').replace(/<script[\s\S]*?<\/script>/gi, '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

export async function suggestReply(id: string) {
  const reply = await prisma.reply.findUnique({ where: { id }, include: { lead: true, campaign: true } });
  if (!reply) return null;

  const classification = classifyReply(reply.body);
  const suggestion = buildReplySuggestion(reply.body, classification, reply.lead.businessName, reply.campaign.geoDomain);
  return prisma.reply.update({
    where: { id },
    data: { suggestedResponse: suggestion, sentiment: classification.sentiment, intentScore: classification.intentScore },
  });
}

export async function getAnalytics(userId: string) {
  await ensureOutboundSeedData();
  const overview = await getOutboundOverview(userId);
  const campaigns = await listCampaigns(userId);
  const snapshots = await prisma.analyticsSnapshot.findMany({
    where: { campaign: { userId } },
    orderBy: { date: 'desc' },
    take: 30,
  });
  const [topTemplates, subjectLines, recommendationLeads] = await Promise.all([
    prisma.template.findMany({
      where: { isArchived: false, userId },
      orderBy: [{ deliverabilityScore: 'desc' }, { spamScore: 'asc' }, { updatedAt: 'desc' }],
      take: 6,
    }),
    prisma.emailLog.groupBy({
      by: ['subject'],
      _count: { subject: true },
      where: { status: { in: ['SENT', 'DELIVERED', 'OPENED', 'CLICKED', 'REPLIED'] }, campaign: { userId } },
      orderBy: { _count: { subject: 'desc' } },
      take: 8,
    }),
    prisma.lead.findMany({
      where: { doNotContact: false, unsubscribed: false, ownerId: userId },
      orderBy: [{ engagementScore: 'desc' }, { domainMatchScore: 'desc' }, { createdAt: 'desc' }],
      take: 8,
    }),
  ]);

  return {
    overview: overview.metrics,
    campaigns,
    snapshots,
    topTemplates: topTemplates.map((template) => ({
      id: template.id,
      name: template.name,
      subject: template.subject,
      spamScore: template.spamScore,
      deliverabilityScore: template.deliverabilityScore,
      tags: template.tags,
      type: template.type,
    })),
    bestSubjectLines: subjectLines.map((item) => ({ subject: item.subject, sent: item._count.subject })),
    sendTimeSuggestions: [
      { label: 'Tuesday 9:30 AM local', confidence: 88 },
      { label: 'Wednesday 10:15 AM local', confidence: 82 },
      { label: 'Thursday 2:10 PM local', confidence: 74 },
    ],
    domainRecommendations: buildDomainRecommendations(recommendationLeads, campaigns),
    insights: buildAiInsights(overview.metrics),
  };
}

export async function generateEmail(input: EmailGenerationInput) {
  return generateOutboundEmail(input);
}

export function rewriteGeneratedEmail(body: string, action: 'shorter' | 'professional' | 'persuasive' | 'friendly') {
  return {
    body: rewriteEmail(body, action),
    spamScore: scoreSpamRisk(body),
  };
}

export async function recordOpen(trackingToken: string, requestInfo: RequestInfoPayload) {
  const log = await prisma.emailLog.findUnique({ where: { trackingToken } });
  if (!log) return null;

  await prisma.emailLog.update({
    where: { id: log.id },
    data: {
      status: log.status === 'SENT' || log.status === 'DELIVERED' ? 'OPENED' : log.status,
      openedAt: log.openedAt || new Date(),
    },
  });
  await recordEmailEvent(log.id, 'OPENED', requestInfo);
  if (log.campaignLeadId) {
    await prisma.campaignLead.update({
      where: { id: log.campaignLeadId },
      data: { status: 'OPENED', stage: 'Opened', openedAt: new Date(), engagementScore: { increment: 10 } },
    });
  }
  await prisma.lead.update({
    where: { id: log.leadId },
    data: { pipelineStage: 'Opened', openCount: { increment: 1 }, engagementScore: { increment: 10 } },
  });
  return log;
}

export async function recordClick(trackingToken: string, requestInfo: RequestInfoPayload) {
  const log = await prisma.emailLog.findUnique({ where: { trackingToken } });
  if (!log) return null;

  await prisma.emailLog.update({
    where: { id: log.id },
    data: { status: 'CLICKED', clickedAt: log.clickedAt || new Date() },
  });
  await recordEmailEvent(log.id, 'CLICKED', requestInfo);
  if (log.campaignLeadId) {
    await prisma.campaignLead.update({
      where: { id: log.campaignLeadId },
      data: { status: 'CLICKED', stage: 'Clicked', clickedAt: new Date(), engagementScore: { increment: 20 } },
    });
  }
  await prisma.lead.update({
    where: { id: log.leadId },
    data: { pipelineStage: 'Opened', clickCount: { increment: 1 }, engagementScore: { increment: 20 } },
  });
  return log;
}

export async function unsubscribe(unsubscribeToken: string) {
  const log = await prisma.emailLog.findFirst({ where: { unsubscribeToken }, include: { lead: true, campaignLead: true } });
  if (!log) return null;

  await prisma.$transaction([
    prisma.suppressionEntry.upsert({
      where: { email: log.toEmail },
      update: { reason: 'unsubscribe', source: 'tracking-link', campaignId: log.campaignId, leadId: log.leadId },
      create: { email: log.toEmail, reason: 'unsubscribe', source: 'tracking-link', campaignId: log.campaignId, leadId: log.leadId },
    }),
    prisma.lead.update({
      where: { id: log.leadId },
      data: { unsubscribed: true, doNotContact: true, pipelineStage: 'Unsubscribed', leadStatus: 'Unsubscribed' },
    }),
    prisma.emailLog.update({
      where: { id: log.id },
      data: { status: 'UNSUBSCRIBED', unsubscribedAt: new Date() },
    }),
  ]);

  if (log.campaignLeadId) {
    await prisma.emailLog.updateMany({
      where: { campaignLeadId: log.campaignLeadId, status: 'QUEUED' },
      data: { status: 'CANCELLED', errorMessage: 'Sequence stopped after unsubscribe.' },
    });
  }

  if (log.campaignLeadId) {
    await prisma.campaignLead.update({
      where: { id: log.campaignLeadId },
      data: { status: 'UNSUBSCRIBED', stage: 'Unsubscribed', unsubscribedAt: new Date() },
    });
  }

  await recordEmailEvent(log.id, 'UNSUBSCRIBED', {});
  return log;
}

// Dedup for webhook events. Single-user local app — in-memory set is enough.
// Capped LRU to avoid unbounded growth.
const webhookSeen = new Set<string>();
const WEBHOOK_DEDUP_CAP = 5000;

function rememberWebhookKey(key: string): boolean {
  if (webhookSeen.has(key)) return false;
  webhookSeen.add(key);
  if (webhookSeen.size > WEBHOOK_DEDUP_CAP) {
    const firstKey = webhookSeen.values().next().value;
    if (firstKey) webhookSeen.delete(firstKey);
  }
  return true;
}

export async function handleProviderWebhook(provider: string, payload: unknown) {
  const event = await prisma.webhookEvent.create({
    data: {
      provider,
      type: inferWebhookType(payload),
      payload: payload as any,
      processed: false,
    },
  });

  const events = Array.isArray(payload) ? payload : [payload];
  for (const item of events) {
    try {
      const data = item as Record<string, any>;
      const token = data.trackingToken || data.custom_args?.trackingToken || data.metadata?.trackingToken;
      const messageId = data.sg_message_id || data.message_id || data.id || data.MessageId;
      const eventType = mapProviderEvent(data.event || data.type || data.eventType || data.notificationType);
      const log = token
        ? await prisma.emailLog.findUnique({ where: { trackingToken: token } })
        : messageId
        ? await prisma.emailLog.findFirst({ where: { providerMessageId: String(messageId) } })
        : null;

      if (log && eventType) {
        // Provider retry dedup. Bucket by 60-second window so legit retries
        // from the same provider collapse but a genuine OPEN-then-OPEN minutes
        // apart still increments.
        const tsBucket = Math.floor(Date.now() / 60000);
        const dedupKey = `${provider}:${log.id}:${eventType}:${data.timestamp || data.created_at || tsBucket}`;
        if (!rememberWebhookKey(dedupKey)) {
          continue;
        }
        await applyProviderEvent(log, eventType, data);
      } else if (!log) {
        // Orphan event — no matching log. Don't drop silently; record for debugging.
        console.warn(`[Webhook] Orphan event from ${provider}: token=${token || 'none'} msgId=${messageId || 'none'} type=${eventType || 'unknown'}`);
      }
    } catch (err: any) {
      // One bad event must NOT abort the rest of the batch
      console.error(`[Webhook] Failed to apply event from ${provider}:`, err?.message);
    }
  }

  await prisma.webhookEvent.update({ where: { id: event.id }, data: { processed: true } });
  return { processed: true, webhookEventId: event.id };
}

async function applyProviderEvent(log: any, eventType: string, payload: Record<string, unknown>) {
  if (eventType === 'OPENED') {
    await recordOpen(log.trackingToken, payload);
    return;
  }

  if (eventType === 'CLICKED') {
    await recordClick(log.trackingToken, payload);
    return;
  }

  const now = new Date();

  if (eventType === 'DELIVERED') {
    await prisma.emailLog.update({
      where: { id: log.id },
      data: {
        status: ['OPENED', 'CLICKED', 'REPLIED'].includes(log.status) ? log.status : 'DELIVERED',
        deliveredAt: log.deliveredAt || now,
      },
    });
    await recordEmailEvent(log.id, 'DELIVERED', payload);
    await recordCampaignOutcome(log.toEmail, 'DELIVERED').catch(() => undefined);
    return;
  }

  if (eventType === 'REPLIED') {
    await prisma.emailLog.update({
      where: { id: log.id },
      data: { status: 'REPLIED', repliedAt: log.repliedAt || now },
    });
    if (log.campaignLeadId) {
      await Promise.all([
        prisma.campaignLead.update({
          where: { id: log.campaignLeadId },
          data: { status: 'REPLIED', stage: 'Replied', repliedAt: now, engaged: true, engagementScore: { increment: 20 } },
        }),
        stopQueuedFollowUps(log.campaignLeadId, 'Sequence stopped after reply webhook.'),
      ]);
    }
    await prisma.lead.update({
      where: { id: log.leadId },
      data: { leadStatus: 'Replied', pipelineStage: 'Replied', replyCount: { increment: 1 }, engagementScore: { increment: 20 } },
    });
    await recordEmailEvent(log.id, 'REPLIED', payload);
    await recordCampaignOutcome(log.toEmail, 'REPLIED').catch(() => undefined);
    return;
  }

  if (eventType === 'BOUNCED') {
    await suppressLogRecipient(log, {
      status: 'BOUNCED',
      stage: 'Bounced',
      reason: 'bounce',
      source: 'provider-webhook',
      stopMessage: 'Sequence stopped after provider bounce.',
    });
    // Auto-downgrade the LeadEmail so future campaigns avoid it
    await prisma.leadEmail.updateMany({
      where: { email: log.toEmail, leadId: log.leadId },
      data: { status: 'INVALID', confidenceScore: 0 },
    }).catch(() => undefined);
    await recordEmailEvent(log.id, 'BOUNCED', payload);
    await recordCampaignOutcome(log.toEmail, 'BOUNCED').catch(() => undefined);
    return;
  }

  if (eventType === 'COMPLAINT') {
    await suppressLogRecipient(log, {
      status: 'COMPLAINT',
      stage: 'Complaint',
      reason: 'complaint',
      source: 'provider-webhook',
      stopMessage: 'Sequence stopped after spam complaint.',
    });
    await recordEmailEvent(log.id, 'COMPLAINT', payload);
    await recordCampaignOutcome(log.toEmail, 'COMPLAINT').catch(() => undefined);
    return;
  }

  if (eventType === 'UNSUBSCRIBED') {
    await suppressLogRecipient(log, {
      status: 'UNSUBSCRIBED',
      stage: 'Unsubscribed',
      reason: 'unsubscribe',
      source: 'provider-webhook',
      stopMessage: 'Sequence stopped after provider unsubscribe.',
      markUnsubscribed: true,
    });
    await recordEmailEvent(log.id, 'UNSUBSCRIBED', payload);
    return;
  }

  await recordEmailEvent(log.id, eventType, payload);
}

async function suppressLogRecipient(
  log: any,
  config: {
    status: string;
    stage: string;
    reason: string;
    source: string;
    stopMessage: string;
    markUnsubscribed?: boolean;
  }
) {
  const now = new Date();
  const emailLogUpdate: Record<string, unknown> = {
    status: config.status,
    errorMessage: config.stopMessage,
  };

  if (config.status === 'BOUNCED') {
    emailLogUpdate.bouncedAt = log.bouncedAt || now;
  }
  if (config.status === 'UNSUBSCRIBED') {
    emailLogUpdate.unsubscribedAt = log.unsubscribedAt || now;
  }

  await prisma.$transaction([
    prisma.suppressionEntry.upsert({
      where: { email: log.toEmail },
      update: { reason: config.reason, source: config.source, campaignId: log.campaignId, leadId: log.leadId },
      create: { email: log.toEmail, reason: config.reason, source: config.source, campaignId: log.campaignId, leadId: log.leadId },
    }),
    prisma.emailLog.update({
      where: { id: log.id },
      data: emailLogUpdate,
    }),
    prisma.lead.update({
      where: { id: log.leadId },
      data: {
        doNotContact: true,
        unsubscribed: config.markUnsubscribed || undefined,
        leadStatus: config.stage,
        pipelineStage: config.stage,
      },
    }),
  ]);

  if (log.campaignLeadId) {
    await Promise.all([
      stopQueuedFollowUps(log.campaignLeadId, config.stopMessage),
      prisma.campaignLead.update({
        where: { id: log.campaignLeadId },
        data: {
          status: config.status === 'UNSUBSCRIBED' ? 'UNSUBSCRIBED' : 'SUPPRESSED',
          stage: config.stage,
          unsubscribedAt: config.status === 'UNSUBSCRIBED' ? now : undefined,
          pausedReason: config.stopMessage,
        },
      }),
    ]);
  }
}

async function stopQueuedFollowUps(campaignLeadId: string, reason: string) {
  await prisma.emailLog.updateMany({
    where: {
      campaignLeadId,
      status: 'QUEUED',
    },
    data: {
      status: 'CANCELLED',
      errorMessage: reason,
    },
  });
}

export async function recordEmailEvent(
  emailLogId: string | undefined | null,
  type: string,
  payload: Record<string, unknown>
) {
  if (!emailLogId) return null;
  const log = await prisma.emailLog.findUnique({ where: { id: emailLogId } });
  if (!log) return null;

  const event = await prisma.emailEvent.create({
    data: {
      campaignId: log.campaignId,
      campaignLeadId: log.campaignLeadId,
      emailLogId: log.id,
      type,
      payload: payload as Prisma.InputJsonObject,
      ipAddress: typeof payload.ipAddress === 'string' ? payload.ipAddress : undefined,
      userAgent: typeof payload.userAgent === 'string' ? payload.userAgent : undefined,
      provider: log.provider,
    },
  });

  await Promise.all([
    refreshCampaignAnalyticsSnapshot(log.campaignId),
    updateSenderHealth(log.senderAccountId),
  ]);

  broadcastOutboundEvent({
    type,
    payload: {
      emailLogId: log.id,
      campaignId: log.campaignId,
      campaignLeadId: log.campaignLeadId,
      subject: log.subject,
    },
  });

  return event;
}

async function refreshCampaignAnalyticsSnapshot(campaignId: string) {
  const dayStart = new Date();
  dayStart.setHours(0, 0, 0, 0);
  const dayEnd = new Date(dayStart);
  dayEnd.setDate(dayEnd.getDate() + 1);

  const [logs, replies, events] = await Promise.all([
    prisma.emailLog.findMany({
      where: {
        campaignId,
        OR: [
          { sentAt: { gte: dayStart, lt: dayEnd } },
          { deliveredAt: { gte: dayStart, lt: dayEnd } },
          { openedAt: { gte: dayStart, lt: dayEnd } },
          { clickedAt: { gte: dayStart, lt: dayEnd } },
          { repliedAt: { gte: dayStart, lt: dayEnd } },
          { bouncedAt: { gte: dayStart, lt: dayEnd } },
          { unsubscribedAt: { gte: dayStart, lt: dayEnd } },
        ],
      },
    }),
    prisma.reply.findMany({
      where: { campaignId, receivedAt: { gte: dayStart, lt: dayEnd } },
    }),
    prisma.emailEvent.findMany({
      where: { campaignId, occurredAt: { gte: dayStart, lt: dayEnd } },
    }),
  ]);

  const countEvents = (...types: string[]) => events.filter((event) => types.includes(event.type)).length;
  const sent = logs.filter((log) => log.sentAt && log.sentAt >= dayStart && log.sentAt < dayEnd).length;
  const delivered = logs.filter((log) => log.deliveredAt && log.deliveredAt >= dayStart && log.deliveredAt < dayEnd).length || countEvents('DELIVERED');
  const opens = countEvents('OPENED');
  const clicks = countEvents('CLICKED');
  const positiveReplies = replies.filter((reply) => reply.sentiment === 'positive' || reply.buyingIntent).length;
  const negativeReplies = replies.filter((reply) => reply.sentiment === 'negative').length;
  const bounces = countEvents('BOUNCED');
  const unsubscribes = countEvents('UNSUBSCRIBED');
  const complaints = countEvents('COMPLAINT');
  const engagementScore = clamp(opens * 4 + clicks * 8 + positiveReplies * 20 - bounces * 10 - unsubscribes * 12 - complaints * 20, 0, 100);
  const deliverabilityScore = clamp(100 - bounces * 5 - complaints * 20 - unsubscribes * 2, 0, 100);

  const existing = await prisma.analyticsSnapshot.findFirst({
    where: {
      campaignId,
      date: { gte: dayStart, lt: dayEnd },
    },
  });

  const data = {
    campaignId,
    date: dayStart,
    sent,
    delivered,
    opens,
    clicks,
    replies: replies.length,
    positiveReplies,
    negativeReplies,
    bounces,
    unsubscribes,
    complaints,
    engagementScore,
    deliverabilityScore,
  };

  if (existing) {
    await prisma.analyticsSnapshot.update({
      where: { id: existing.id },
      data,
    });
    return;
  }

  await prisma.analyticsSnapshot.create({ data });
}

async function updateSenderHealth(senderAccountId?: string | null) {
  if (!senderAccountId) return;

  const [sentCount, bounceCount, complaintCount] = await Promise.all([
    prisma.emailLog.count({
      where: { senderAccountId, sentAt: { not: null } },
    }),
    prisma.emailEvent.count({
      where: {
        provider: { not: null },
        type: 'BOUNCED',
        emailLog: { senderAccountId },
      },
    }),
    prisma.emailEvent.count({
      where: {
        provider: { not: null },
        type: 'COMPLAINT',
        emailLog: { senderAccountId },
      },
    }),
  ]);

  if (sentCount === 0) return;

  const bounceRate = bounceCount / sentCount;
  const spamComplaintRate = complaintCount / sentCount;
  const deliverabilityScore = clamp(Math.round(100 - bounceRate * 500 - spamComplaintRate * 2500), 0, 100);

  await prisma.senderAccount.update({
    where: { id: senderAccountId },
    data: {
      bounceRate,
      spamComplaintRate,
      deliverabilityScore,
      lastVerifiedAt: new Date(),
    },
  });
}

interface RequestInfoPayload extends Record<string, unknown> {
  ipAddress?: string;
  userAgent?: string;
  url?: string;
}

// Daily / hourly send quota for the user's active senders: how many emails have
// gone out today and how many are left before the cap. Powers the "emails left"
// indicator in the UI.
export async function getSendQuota(userId: string) {
  const now = new Date();
  const startOfDay = new Date(now);
  startOfDay.setHours(0, 0, 0, 0);
  const hourAgo = new Date(now.getTime() - 60 * 60 * 1000);

  const senders = await prisma.senderAccount.findMany({
    where: { userId, status: { in: ['active', 'warming'] } },
    select: { id: true, fromEmail: true, label: true, dailyLimit: true, hourlyLimit: true },
  });

  let dailyLimit = 0, hourlyLimit = 0, sentToday = 0, sentThisHour = 0;
  const perSender = [] as Array<Record<string, unknown>>;
  for (const s of senders) {
    const [daily, hourly] = await Promise.all([
      prisma.emailLog.count({ where: { senderAccountId: s.id, sentAt: { gte: startOfDay } } }),
      prisma.emailLog.count({ where: { senderAccountId: s.id, sentAt: { gte: hourAgo } } }),
    ]);
    dailyLimit += s.dailyLimit;
    hourlyLimit += s.hourlyLimit;
    sentToday += daily;
    sentThisHour += hourly;
    perSender.push({
      id: s.id,
      fromEmail: s.fromEmail,
      label: s.label,
      dailyLimit: s.dailyLimit,
      hourlyLimit: s.hourlyLimit,
      sentToday: daily,
      sentThisHour: hourly,
      dailyRemaining: Math.max(0, s.dailyLimit - daily),
      hourlyRemaining: Math.max(0, s.hourlyLimit - hourly),
    });
  }

  return {
    senderCount: senders.length,
    dailyLimit,
    hourlyLimit,
    sentToday,
    sentThisHour,
    dailyRemaining: Math.max(0, dailyLimit - sentToday),
    hourlyRemaining: Math.max(0, hourlyLimit - sentThisHour),
    // Daily counters reset at the next UTC midnight (server runs in UTC).
    resetsAt: new Date(startOfDay.getTime() + 24 * 60 * 60 * 1000).toISOString(),
    senders: perSender,
  };
}

async function getRotatedSender() {
  const senders = await prisma.senderAccount.findMany({
    where: { status: { in: ['active', 'warming'] } },
    orderBy: [{ rotationRank: 'asc' }, { createdAt: 'asc' }],
  });
  // Prefer a real, configured provider (has an apiKey/password) over the
  // dry-run/placeholder senders, so campaigns actually deliver by default.
  const configured = senders.find((s) => s.provider !== 'DRY_RUN' && senderHasConfig(s.providerConfig));
  return configured || senders.find((s) => s.provider !== 'DRY_RUN') || senders[0] || null;
}

function senderHasConfig(config: unknown): boolean {
  if (!config || typeof config !== 'object') return false;
  const cfg = config as Record<string, unknown>;
  return Boolean(cfg.apiKey || cfg.password || cfg.domain);
}

// Resolve the sender a campaign should send from: the explicitly chosen one
// (if still active), otherwise the best rotated sender.
async function resolveCampaignSender(campaign: any) {
  const chosenId = (campaign?.metadata as any)?.senderAccountId;
  if (chosenId) {
    const chosen = await prisma.senderAccount.findUnique({ where: { id: chosenId } });
    if (chosen && (chosen.status === 'active' || chosen.status === 'warming')) return chosen;
  }
  return getRotatedSender();
}

async function senderWithinLimits(senderAccountId: string, _hourlyLimit: number, dailyLimit: number) {
  const now = new Date();
  const startOfDay = new Date(now);
  startOfDay.setHours(0, 0, 0, 0);
  // The daily cap is the single send limit — send continuously until the
  // sender's daily max, then stop. The hourly throttle is intentionally not
  // enforced so the full daily budget is used in one run instead of stalling.
  const daily = await prisma.emailLog.count({ where: { senderAccountId, sentAt: { gte: startOfDay } } });
  return daily < dailyLimit;
}

async function isSuppressed(email: string) {
  return Boolean(await prisma.suppressionEntry.findUnique({ where: { email: email.toLowerCase() } }));
}

async function sendWithRetry(log: any, sender: any, maxAttempts = 3): Promise<any> {
  let lastErr: any = null;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await sendViaProvider(log, sender);
    } catch (err: any) {
      lastErr = err;
      if (!isTransientSendError(err) || attempt === maxAttempts) {
        throw err;
      }
      const delayMs = Math.min(2000 * 2 ** (attempt - 1), 10000); // 2s, 4s, 8s capped
      console.warn(`[Send] Transient error on attempt ${attempt}/${maxAttempts} for ${log.toEmail}: ${err.message}. Retrying in ${delayMs}ms.`);
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }
  throw lastErr;
}

function isTransientSendError(err: any): boolean {
  const msg = String(err?.message || '').toLowerCase();
  const code = err?.code || '';
  // Network / connection level
  if (['ETIMEDOUT', 'ECONNRESET', 'ECONNREFUSED', 'EAI_AGAIN', 'ENETUNREACH', 'EHOSTUNREACH'].includes(code)) return true;
  if (msg.includes('timeout') || msg.includes('socket hang up')) return true;
  // HTTP 5xx / rate limits
  const status = err?.response?.status || err?.status;
  if (status && (status >= 500 || status === 429)) return true;
  // SMTP transient codes embedded in message
  if (/\b(421|450|451|452)\b/.test(msg)) return true;
  return false;
}

export async function sendOneOff(input: {
  senderAccountId: string;
  to: string;
  subject: string;
  body: string;
  bodyHtml?: string;
}) {
  const sender = await prisma.senderAccount.findUnique({ where: { id: input.senderAccountId } });
  if (!sender) throw new Error('Sender account not found.');
  if (sender.status !== 'active') throw new Error(`Sender is ${sender.status}, not active.`);

  const fakeLog = {
    id: `oneoff_${randomToken()}`,
    toEmail: input.to,
    subject: input.subject,
    bodyText: input.body,
    bodyHtml: input.bodyHtml || `<div style="white-space:pre-wrap;font-family:sans-serif">${input.body.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</div>`,
    trackingToken: randomToken(),
  };

  const result = await sendViaProvider(fakeLog, sender);
  return {
    ok: !result.dryRun,
    dryRun: !!result.dryRun,
    note: (result as any).note,
    providerMessageId: result.providerMessageId,
    sender: { id: sender.id, fromEmail: sender.fromEmail, provider: sender.provider },
  };
}

async function sendViaProvider(log: any, sender: any) {
  const config = decryptProviderConfig(sender.providerConfig as Record<string, unknown> | null);
  const provider = String(sender.provider || 'DRY_RUN').toUpperCase();
  // Email subjects must be a single line — providers (e.g. Resend) 422 on
  // embedded newlines. Sanitize defensively regardless of how it was built.
  const safeSubject = String(log.subject || '').replace(/[\r\n]+/g, ' ').trim();

  if (provider === 'RESEND' && config.apiKey) {
    const response = await axios.post(
      'https://api.resend.com/emails',
      {
        from: `${sender.fromName} <${sender.fromEmail}>`,
        to: [log.toEmail],
        subject: safeSubject,
        text: log.bodyText,
        html: log.bodyHtml,
        reply_to: sender.replyTo || sender.fromEmail,
      },
      { headers: { Authorization: `Bearer ${config.apiKey}` }, timeout: 12000, validateStatus: (s) => s < 500 }
    );
    if (response.status >= 400) {
      throw new Error(`Resend ${response.status}: ${response.data?.message || response.data?.error || JSON.stringify(response.data).slice(0, 200)}`);
    }
    return { providerMessageId: response.data?.id || randomUUID(), dryRun: false };
  }

  if (provider === 'SENDGRID' && config.apiKey) {
    const response = await axios.post(
      'https://api.sendgrid.com/v3/mail/send',
      {
        personalizations: [{ to: [{ email: log.toEmail }], custom_args: { trackingToken: log.trackingToken } }],
        from: { email: sender.fromEmail, name: sender.fromName },
        reply_to: { email: sender.replyTo || sender.fromEmail },
        subject: safeSubject,
        content: [
          { type: 'text/plain', value: log.bodyText },
          { type: 'text/html', value: log.bodyHtml || textToTrackedHtml(log.bodyText, log.trackingToken) },
        ],
      },
      { headers: { Authorization: `Bearer ${config.apiKey}` }, timeout: 12000, validateStatus: (status) => status < 500 }
    );
    if (response.status >= 400) {
      const errBody = typeof response.data === 'string' ? response.data : JSON.stringify(response.data).slice(0, 200);
      throw new Error(`SendGrid ${response.status}: ${errBody}`);
    }
    return { providerMessageId: response.headers['x-message-id'] || randomUUID(), dryRun: false, status: response.status };
  }

  if (provider === 'MAILGUN' && config.apiKey && config.domain) {
    const form = new URLSearchParams();
    form.set('from', `${sender.fromName} <${sender.fromEmail}>`);
    form.set('to', log.toEmail);
    form.set('subject', safeSubject);
    form.set('text', log.bodyText);
    form.set('html', log.bodyHtml || textToTrackedHtml(log.bodyText, log.trackingToken));
    form.set('v:trackingToken', log.trackingToken);
    const response = await axios.post(`https://api.mailgun.net/v3/${config.domain}/messages`, form, {
      auth: { username: 'api', password: String(config.apiKey) },
      timeout: 12000,
    });
    return { providerMessageId: response.data?.id || randomUUID(), dryRun: false };
  }

  if (provider === 'SES') {
    if (!config.accessKeyId) throw new Error('SES sender is missing accessKeyId');
    if (!config.secretAccessKey) throw new Error('SES sender is missing secretAccessKey');
    if (!config.region) throw new Error('SES sender is missing region');
    const response = await sendViaSes(log, sender, config);
    return {
      providerMessageId: response.providerMessageId || randomUUID(),
      dryRun: false,
      status: response.status,
    };
  }

  if (provider === 'SMTP') {
    if (!config.host) throw new Error('SMTP sender is missing host');
    const response = await sendViaSmtp(log, sender, config);
    return {
      providerMessageId: response.providerMessageId || randomUUID(),
      dryRun: false,
      transport: 'smtp',
      status: response.status,
    };
  }

  // Configured providers with missing creds must error, not silently dry-run
  if (provider === 'RESEND') throw new Error('Resend sender is missing apiKey');
  if (provider === 'SENDGRID') throw new Error('SendGrid sender is missing apiKey');
  if (provider === 'MAILGUN') throw new Error('Mailgun sender is missing apiKey or domain');

  return {
    providerMessageId: `dryrun_${randomToken()}`,
    dryRun: true,
    note: provider === 'DRY_RUN' ? 'Dry-run sender account' : `${provider} adapter not configured`,
  };
}

async function sendViaSes(log: any, sender: any, config: Record<string, any>) {
  const region = String(config.region);
  const host = `email.${region}.amazonaws.com`;
  const path = '/v2/email/outbound-emails';
  const safeSubject = String(log.subject || '').replace(/[\r\n]+/g, ' ').trim();
  const body = JSON.stringify({
    FromEmailAddress: `${sender.fromName} <${sender.fromEmail}>`,
    Destination: { ToAddresses: [log.toEmail] },
    ReplyToAddresses: [sender.replyTo || sender.fromEmail].filter(Boolean),
    Content: {
      Simple: {
        Subject: { Data: safeSubject, Charset: 'UTF-8' },
        Body: {
          Text: { Data: log.bodyText, Charset: 'UTF-8' },
          Html: { Data: log.bodyHtml || textToTrackedHtml(log.bodyText, log.trackingToken), Charset: 'UTF-8' },
        },
      },
    },
  });

  const headers = buildAwsV4Headers({
    accessKeyId: String(config.accessKeyId),
    secretAccessKey: String(config.secretAccessKey),
    sessionToken: typeof config.sessionToken === 'string' ? config.sessionToken : undefined,
    region,
    service: 'email',
    method: 'POST',
    host,
    path,
    body,
    contentType: 'application/json',
  });

  const response = await fetch(`https://${host}${path}`, {
    method: 'POST',
    headers,
    body,
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new Error(`SES send failed (${response.status}): ${detail || response.statusText}`);
  }

  return {
    providerMessageId: response.headers.get('x-amzn-requestid') || response.headers.get('x-amzn-request-id') || randomUUID(),
    status: response.status,
  };
}

async function sendViaSmtp(log: any, sender: any, config: Record<string, any>) {
  const host = String(config.host);
  const port = Number(config.port || (config.secure ? 465 : 25));
  const secure = Boolean(config.secure || port === 465);
  const username = typeof config.username === 'string' ? config.username : undefined;
  const password = typeof config.password === 'string' ? config.password : undefined;
  const timeoutMs = Number(config.timeoutMs || 15000);
  const client = await connectSmtp(host, port, secure, timeoutMs);

  try {
    await client.expect([220]);
    await client.command(`EHLO ${config.heloDomain || 'geolead.ai'}`, [250]);

    if (!secure && config.starttls && client.capabilities.has('STARTTLS')) {
      await client.command('STARTTLS', [220]);
      await client.upgradeToTls();
      await client.command(`EHLO ${config.heloDomain || 'geolead.ai'}`, [250]);
    }

    if (username && password) {
      await client.command('AUTH LOGIN', [334]);
      await client.command(Buffer.from(username, 'utf8').toString('base64'), [334]);
      await client.command(Buffer.from(password, 'utf8').toString('base64'), [235]);
    }

    await client.command(`MAIL FROM:<${sender.fromEmail}>`, [250, 251]);
    await client.command(`RCPT TO:<${log.toEmail}>`, [250, 251]);
    await client.command('DATA', [354]);
    await client.data(buildSmtpMessage(log, sender));
    await client.command('.', [250]);
    await client.command('QUIT', [221]);
    return { providerMessageId: randomUUID(), status: 250 };
  } finally {
    client.close();
  }
}

function buildSmtpMessage(log: any, sender: any) {
  const boundary = `boundary-${randomToken()}`;
  const html = log.bodyHtml || textToTrackedHtml(log.bodyText, log.trackingToken);
  const safeSubject = String(log.subject || '').replace(/[\r\n]+/g, ' ').trim();
  return [
    `From: ${sender.fromName} <${sender.fromEmail}>`,
    `To: ${log.toEmail}`,
    `Subject: ${safeSubject}`,
    `Reply-To: ${sender.replyTo || sender.fromEmail}`,
    'MIME-Version: 1.0',
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    '',
    `--${boundary}`,
    'Content-Type: text/plain; charset="UTF-8"',
    '',
    log.bodyText,
    '',
    `--${boundary}`,
    'Content-Type: text/html; charset="UTF-8"',
    '',
    html,
    '',
    `--${boundary}--`,
    '',
  ].join('\r\n');
}

function buildAwsV4Headers(input: {
  accessKeyId: string;
  secretAccessKey: string;
  sessionToken?: string;
  region: string;
  service: string;
  method: string;
  host: string;
  path: string;
  body: string;
  contentType: string;
}) {
  const now = new Date();
  const amzDate = formatAwsTimestamp(now);
  const dateStamp = amzDate.slice(0, 8);
  const payloadHash = createHash('sha256').update(input.body).digest('hex');
  const canonicalHeaders: Record<string, string> = {
    'content-type': input.contentType,
    host: input.host,
    'x-amz-date': amzDate,
  };
  if (input.sessionToken) {
    canonicalHeaders['x-amz-security-token'] = input.sessionToken;
  }

  const sortedHeaderEntries = Object.entries(canonicalHeaders).sort(([left], [right]) => left.localeCompare(right));
  const signedHeaders = sortedHeaderEntries.map(([key]) => key).join(';');
  const canonicalRequest = [
    input.method,
    input.path,
    '',
    sortedHeaderEntries.map(([key, value]) => `${key}:${value.trim()}`).join('\n') + '\n',
    signedHeaders,
    payloadHash,
  ].join('\n');

  const credentialScope = `${dateStamp}/${input.region}/${input.service}/aws4_request`;
  const stringToSign = [
    'AWS4-HMAC-SHA256',
    amzDate,
    credentialScope,
    createHash('sha256').update(canonicalRequest).digest('hex'),
  ].join('\n');

  const signingKey = deriveAwsSigningKey(input.secretAccessKey, dateStamp, input.region, input.service);
  const signature = createHmac('sha256', signingKey).update(stringToSign).digest('hex');

  return {
    ...canonicalHeaders,
    Authorization: `AWS4-HMAC-SHA256 Credential=${input.accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`,
  };
}

function deriveAwsSigningKey(secretAccessKey: string, dateStamp: string, region: string, service: string) {
  const kDate = createHmac('sha256', `AWS4${secretAccessKey}`).update(dateStamp).digest();
  const kRegion = createHmac('sha256', kDate).update(region).digest();
  const kService = createHmac('sha256', kRegion).update(service).digest();
  return createHmac('sha256', kService).update('aws4_request').digest();
}

function formatAwsTimestamp(date: Date) {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  const hour = String(date.getUTCHours()).padStart(2, '0');
  const minute = String(date.getUTCMinutes()).padStart(2, '0');
  const second = String(date.getUTCSeconds()).padStart(2, '0');
  return `${year}${month}${day}T${hour}${minute}${second}Z`;
}

// SMTP transport moved to ./smtpTransport.ts

function summarizeCampaign(campaign: any) {
  const logs = campaign.emailLogs || [];
  const replies = campaign.replies || [];
  const sent = logs.filter((log: any) => ['SENT', 'DELIVERED', 'OPENED', 'CLICKED', 'REPLIED'].includes(log.status)).length;
  const opens = logs.filter((log: any) => log.openedAt || ['OPENED', 'CLICKED', 'REPLIED'].includes(log.status)).length;
  const clicks = logs.filter((log: any) => log.clickedAt || ['CLICKED', 'REPLIED'].includes(log.status)).length;
  const bounces = logs.filter((log: any) => log.status === 'BOUNCED').length;
  const unsubscribes = logs.filter((log: any) => log.status === 'UNSUBSCRIBED').length;
  const positiveReplies = replies.filter((reply: any) => reply.sentiment === 'positive' || reply.buyingIntent).length;
  const negativeReplies = replies.filter((reply: any) => reply.sentiment === 'negative').length;

  return {
    id: campaign.id,
    name: campaign.name,
    objective: campaign.objective,
    geoDomain: campaign.geoDomain,
    niche: campaign.niche,
    cityState: campaign.cityState,
    tone: campaign.tone,
    language: campaign.language,
    status: campaign.status,
    dailyLimit: campaign.dailyLimit,
    createdAt: campaign.createdAt,
    updatedAt: campaign.updatedAt,
    recipients: campaign.campaignLeads?.length || 0,
    sent,
    delivered: logs.filter((log: any) => log.deliveredAt || ['DELIVERED', 'OPENED', 'CLICKED', 'REPLIED'].includes(log.status)).length,
    opens,
    clicks,
    replies: replies.length,
    positiveReplies,
    negativeReplies,
    bounces,
    unsubscribes,
    openRate: rate(opens, sent),
    clickRate: rate(clicks, sent),
    replyRate: rate(replies.length, sent),
    bounceRate: rate(bounces, sent),
    unsubscribeRate: rate(unsubscribes, sent),
    engagementScore: clamp(opens * 4 + clicks * 8 + positiveReplies * 20 - bounces * 10 - unsubscribes * 12, 0, 100),
    nextFollowUpAt: (() => {
      const queuedFollowUps = logs.filter((l: any) =>
        l.status === 'QUEUED' && l.scheduledAt && l.sequenceStepId
      );
      if (queuedFollowUps.length === 0) return null;
      queuedFollowUps.sort((a: any, b: any) => new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime());
      return queuedFollowUps[0].scheduledAt;
    })(),
  };
}

function formatReply(reply: any) {
  return {
    id: reply.id,
    campaignId: reply.campaignId,
    campaignName: reply.campaign?.name,
    leadId: reply.leadId,
    businessName: reply.lead?.businessName,
    fromEmail: reply.fromEmail,
    subject: reply.subject,
    body: reply.body,
    sentiment: reply.sentiment,
    intentScore: reply.intentScore,
    buyingIntent: reply.buyingIntent,
    status: reply.status,
    suggestedResponse: reply.suggestedResponse,
    receivedAt: reply.receivedAt,
  };
}

function formatEvent(event: any) {
  return {
    id: event.id,
    type: event.type,
    campaignName: event.campaign?.name,
    occurredAt: event.occurredAt,
    payload: event.payload,
  };
}

function maskSenderAccount(sender: any) {
  return {
    id: sender.id,
    label: sender.label,
    provider: sender.provider,
    fromName: sender.fromName,
    fromEmail: sender.fromEmail,
    replyTo: sender.replyTo,
    status: sender.status,
    dailyLimit: sender.dailyLimit,
    hourlyLimit: sender.hourlyLimit,
    warmupEnabled: sender.warmupEnabled,
    warmupTarget: sender.warmupTarget,
    dkimStatus: sender.dkimStatus,
    spfStatus: sender.spfStatus,
    dmarcStatus: sender.dmarcStatus,
    deliverabilityScore: sender.deliverabilityScore,
    bounceRate: sender.bounceRate,
    spamComplaintRate: sender.spamComplaintRate,
    hasEncryptedConfig: Boolean((sender.providerConfig as any)?.encrypted),
    lastVerifiedAt: sender.lastVerifiedAt,
    createdAt: sender.createdAt,
    updatedAt: sender.updatedAt,
  };
}

function personalize(
  template: string,
  campaign: any,
  lead: any,
  tokens: { trackingToken: string; unsubscribeToken: string },
  physicalAddress: string = DEFAULT_PHYSICAL_ADDRESS,
  options: { isSubject?: boolean } = {}
) {
  const cityState = campaign.cityState || lead.location || '';
  const unsubscribeUrl = `${OUTBOUND_BASE_URL}/api/outbound/unsubscribe/${tokens.unsubscribeToken}`;
  const bizName = (lead.businessName || '').trim();
  const resolved = template
    // Resolve the business-name token, keeping a natural greeting when the name
    // is missing ("Hi {{businessName}} team," → "Hi there," not "Hi  team,").
    .replace(/\{\{\s*businessName\s*\}\}\s+team\b/gi, bizName ? `${bizName} team` : 'there')
    .replace(/\{\{\s*businessName\s*\}\}/gi, bizName || 'there')
    .replaceAll('{{decisionMakerName}}', lead.decisionMakerName || bizName || 'there')
    .replaceAll('{{decisionMakerRole}}', lead.decisionMakerRole || '')
    .replaceAll('{{geoDomain}}', campaign.geoDomain || '')
    .replaceAll('{{cityState}}', cityState)
    .replaceAll('{{niche}}', campaign.niche || lead.category || '')
    .replaceAll('{{website}}', lead.website || '')
    .replaceAll('{{senderName}}', 'GeoLead AI')
    .replaceAll('{{unsubscribeUrl}}', unsubscribeUrl)
    // Strip any inline unsubscribe token the body still carries; the compact
    // footer below is the single source of the opt-out + address line.
    .replaceAll('{{unsubscribeLine}}', '');

  // Subjects must be a single line (providers reject newlines) and carry no footer.
  if (options.isSubject) {
    return resolved.replace(/\s+/g, ' ').trim();
  }

  // Compact compliance footer. textToTrackedHtml detects /unsubscribe/ URLs and
  // renders them as a small link instead of a click-tracked raw URL.
  const footer = `—\nUnsubscribe: ${unsubscribeUrl} · ${physicalAddress}`;
  return resolved.replace(/\n{3,}/g, '\n\n').trimEnd().concat(`\n\n${footer}`);
}

// Resolve the compliance footer address from the owner's Settings (env fallback baked in).
async function resolvePhysicalAddress(userId?: string | null): Promise<string> {
  return (await getSetting('physicalAddress', userId)) || DEFAULT_PHYSICAL_ADDRESS;
}

function textToTrackedHtml(body: string, trackingToken: string) {
  const escaped = escapeHtml(body)
    .replace(/(https?:\/\/[^\s<]+)/g, (url) => {
      // Unsubscribe links: render as a small plain link, no click-tracking needed.
      if (url.includes('/api/outbound/unsubscribe/')) {
        return `<a href="${url}" style="font-size:11px;color:#9ca3af;text-decoration:underline;">Unsubscribe</a>`;
      }
      return `<a href="${OUTBOUND_BASE_URL}/api/outbound/track/click/${trackingToken}?url=${encodeURIComponent(url)}">${url}</a>`;
    })
    .replace(/\n/g, '<br />');
  return `${escaped}<img src="${OUTBOUND_BASE_URL}/api/outbound/track/open/${trackingToken}.gif" width="1" height="1" alt="" />`;
}

function nextSendTime(campaign: any, offset: number) {
  const base = campaign.startsAt ? new Date(campaign.startsAt) : new Date();
  // smartDelayMin === 0 => instant: every recipient scheduled for now.
  const delayMinutes = offset * clamp(campaign.smartDelayMin ?? 5, 0, 240);
  return new Date(base.getTime() + delayMinutes * 60 * 1000);
}

function buildDeliverabilityAlerts(senders: any[], campaigns: any[]) {
  const alerts: string[] = [];
  if (senders.some((sender) => sender.dkimStatus !== 'verified' || sender.spfStatus !== 'verified')) {
    alerts.push('At least one sender still needs SPF/DKIM verification before high-volume sending.');
  }
  if (senders.some((sender) => sender.bounceRate > 0.05)) {
    alerts.push('Bounce rate is above 5% for at least one sender. Slow the campaign and clean the list.');
  }
  if (campaigns.some((campaign) => campaign.unsubscribeRate > 2)) {
    alerts.push('Unsubscribe rate is elevated. Review targeting and value proposition.');
  }
  if (alerts.length === 0) {
    alerts.push('Deliverability looks stable. Keep warm-up gradual and monitor replies.');
  }
  return alerts;
}

function buildAiInsights(metrics: any) {
  const insights = [
    'Use shorter first-touch emails for local service leads; the current best pattern is under 120 words.',
    'Prioritize leads that opened and clicked before sending a second follow-up.',
    'Pause senders if bounce rate exceeds 5% or complaint rate exceeds 0.1%.',
  ];
  if (metrics.replyRate < 3 && metrics.sent > 20) {
    insights.push('Reply rate is low. Test a more direct subject line and add stronger local context.');
  }
  if (metrics.openRate < 35 && metrics.sent > 20) {
    insights.push('Open rate is below target. Try sender verification and a lower-friction subject line.');
  }
  return insights;
}

function buildDomainRecommendations(leads: any[], campaigns: any[]) {
  if (leads.length === 0) {
    return [
      {
        domain: campaigns[0]?.geoDomain || 'TexasCarVendor.com',
        niche: campaigns[0]?.niche || 'local auto sales',
        cityState: campaigns[0]?.cityState || 'Texas',
        confidence: 76,
        reason: 'Seed recommendation based on the active geo-domain campaign and default local buyer profile.',
        leadCount: campaigns[0]?.recipients || 0,
        exampleLead: campaigns[0]?.name || 'Geo-domain buyer outreach',
      },
      {
        domain: 'CityRoofingQuotes.com',
        niche: 'roofing services',
        cityState: 'Dallas, TX',
        confidence: 71,
        reason: 'High-intent local service niches usually respond well to exact-match geo-domain positioning.',
        leadCount: 0,
        exampleLead: 'Add verified roofing leads to validate this segment.',
      },
    ];
  }

  const grouped = new Map<string, any[]>();
  for (const lead of leads) {
    const niche = lead.category || 'local business';
    const cityState = lead.location || 'United States';
    const key = `${niche}::${cityState}`;
    grouped.set(key, [...(grouped.get(key) || []), lead]);
  }

  return Array.from(grouped.entries())
    .map(([key, group]) => {
      const [niche, cityState] = key.split('::');
      const bestLead = [...group].sort(
        (a, b) => (b.engagementScore || 0) + (b.domainMatchScore || 0) - ((a.engagementScore || 0) + (a.domainMatchScore || 0))
      )[0];
      const matchingCampaign = campaigns.find(
        (campaign) =>
          String(campaign.niche || '').toLowerCase() === String(niche).toLowerCase() ||
          String(campaign.cityState || '').toLowerCase() === String(cityState).toLowerCase()
      );
      const averageDomainMatch =
        group.reduce((sum, lead) => sum + (lead.domainMatchScore || 0), 0) / Math.max(1, group.length);
      const averageEngagement =
        group.reduce((sum, lead) => sum + (lead.engagementScore || 0), 0) / Math.max(1, group.length);
      const confidence = Math.round(clamp(averageDomainMatch * 0.65 + averageEngagement * 0.25 + group.length * 4, 35, 96));

      return {
        domain: matchingCampaign?.geoDomain || domainIdeaFromSegment(niche, cityState),
        niche,
        cityState,
        confidence,
        reason: `${group.length} qualified lead${group.length === 1 ? '' : 's'} match ${niche} in ${cityState}; average domain fit is ${Math.round(averageDomainMatch)}/100.`,
        leadCount: group.length,
        exampleLead: bestLead?.businessName || 'Qualified local lead',
      };
    })
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, 5);
}

function domainIdeaFromSegment(niche: string, cityState: string) {
  const city = cityState.split(',')[0] || cityState;
  const words = `${city} ${niche}`
    .replace(/&/g, ' and ')
    .replace(/[^a-zA-Z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 4)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join('');

  return `${words || 'LocalBuyer'}Leads.com`;
}

function classifyReply(body: string) {
  const text = body.toLowerCase();
  const positive = /(interested|price|cost|details|send|yes|call|talk|available|consider|offer)/i.test(text);
  const negative = /(unsubscribe|remove|not interested|no thanks|stop|do not email|spam)/i.test(text);
  const sentiment = positive ? 'positive' : negative ? 'negative' : 'neutral';
  const intentScore = positive ? 86 : negative ? 8 : 42;
  return {
    sentiment,
    intentScore,
    buyingIntent: positive && !negative,
    tags: positive ? ['intent:buyer'] : negative ? ['opt-out-risk'] : ['needs-review'],
  };
}

function normalizeInboxAction(action: unknown) {
  const value = String(action || '').toLowerCase();
  if (
    value === 'mark_read' ||
    value === 'mark_interested' ||
    value === 'mark_not_interested' ||
    value === 'create_reminder' ||
    value === 'send_to_negotiation' ||
    value === 'archive'
  ) {
    return value;
  }
  return 'mark_read';
}

function mergeTags(current: string[] = [], next: string[]) {
  return Array.from(new Set([...current, ...next]));
}

function buildReplySuggestion(body: string, classification: ReturnType<typeof classifyReply>, businessName = 'there', geoDomain = 'the domain') {
  if (classification.buyingIntent) {
    return `Hi ${businessName},\n\nThanks for the reply. I can send the price, transfer process, and a simple use-case for ${geoDomain}. Would you prefer a quick email summary or a short call?\n\nBest,\n{{senderName}}`;
  }

  if (classification.sentiment === 'negative') {
    return `Understood, thanks for letting me know. I will not follow up again.\n\nBest,\n{{senderName}}`;
  }

  return `Hi ${businessName},\n\nThanks for getting back to me. Happy to clarify any details about ${geoDomain} or send the transfer steps if useful.\n\nBest,\n{{senderName}}`;
}

function mapProviderEvent(value: unknown) {
  const event = String(value || '').toLowerCase();
  if (event.includes('open')) return 'OPENED';
  if (event.includes('click')) return 'CLICKED';
  if (event.includes('reply')) return 'REPLIED';
  if (event.includes('bounce')) return 'BOUNCED';
  if (event.includes('delivered') || event.includes('delivery')) return 'DELIVERED';
  if (event.includes('unsubscribe')) return 'UNSUBSCRIBED';
  if (event.includes('complaint') || event.includes('spam')) return 'COMPLAINT';
  if (event.includes('processed') || event.includes('sent')) return 'SENT';
  return null;
}

function inferWebhookType(payload: unknown) {
  const first = Array.isArray(payload) ? payload[0] : payload;
  if (!first || typeof first !== 'object') return 'unknown';
  const object = first as Record<string, unknown>;
  return String(object.event || object.type || object.eventType || object.notificationType || 'unknown');
}

function summarizeWebhookPayload(payload: unknown) {
  const first = Array.isArray(payload) ? payload[0] : payload;
  if (!first || typeof first !== 'object') {
    return String(first || 'No payload details');
  }

  const object = first as Record<string, unknown>;
  const pieces = [
    object.email ? `email=${object.email}` : null,
    object.recipient ? `recipient=${object.recipient}` : null,
    object.sg_message_id ? `message=${object.sg_message_id}` : null,
    object.message_id ? `message=${object.message_id}` : null,
    object.id ? `id=${object.id}` : null,
    object.reason ? `reason=${object.reason}` : null,
    object.response ? `response=${object.response}` : null,
  ].filter(Boolean);

  if (Array.isArray(payload) && payload.length > 1) {
    pieces.unshift(`${payload.length} batched events`);
  }

  return pieces.length > 0 ? pieces.slice(0, 4).join(' / ') : 'Provider event received';
}

function encryptProviderConfig(config: Record<string, unknown>) {
  const sanitized: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(config)) {
    sanitized[key] = encryptedFieldPattern.test(key) && typeof value === 'string' ? encryptSecret(value) : value;
  }
  return sanitized;
}

function decryptProviderConfig(config: Record<string, unknown> | null): Record<string, any> {
  if (!config) return {};
  const decrypted: Record<string, any> = {};
  for (const [key, value] of Object.entries(config)) {
    decrypted[key] = typeof value === 'string' && value.startsWith('enc:') ? decryptSecret(value) : value;
  }
  return decrypted;
}

function encryptSecret(value: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `enc:${iv.toString('base64')}:${tag.toString('base64')}:${encrypted.toString('base64')}`;
}

function decryptSecret(value: string) {
  try {
    const [, iv, tag, encrypted] = value.split(':');
    const decipher = createDecipheriv('aes-256-gcm', encryptionKey(), Buffer.from(iv, 'base64'));
    decipher.setAuthTag(Buffer.from(tag, 'base64'));
    return Buffer.concat([decipher.update(Buffer.from(encrypted, 'base64')), decipher.final()]).toString('utf8');
  } catch {
    return '';
  }
}

function encryptionKey() {
  return createHash('sha256')
    .update(process.env.OUTBOUND_SECRET_KEY || process.env.DATABASE_URL || 'geolead-ai-local-dev-key')
    .digest();
}

function defaultTemplates(userId: string) {
  return [
    {
      userId,
      name: 'Geo-domain first touch',
      type: 'cold',
      purpose: 'domain sale',
      language: 'en',
      tone: 'professional',
      subject: '{{geoDomain}} for {{businessName}}',
      previewText: 'A relevant local-domain idea for your market.',
      body: 'Hello {{businessName}} team,\n\nI noticed your business is relevant to {{niche}} in {{cityState}}. I own {{geoDomain}}, and it looks like a clean fit for a focused landing page, paid search campaign, or memorable redirect to your current website.\n\nWould it be worth sending the price and transfer details?\n\nBest,\n{{senderName}}\n\n{{unsubscribeLine}}',
      tags: ['cold', 'geo-domain'],
      variables: { required: ['businessName', 'geoDomain', 'cityState', 'niche', 'unsubscribeUrl'] },
      spamScore: 1,
      deliverabilityScore: 93,
    },
    {
      userId,
      name: 'Friendly follow-up',
      type: 'follow_up',
      purpose: 'follow-up',
      language: 'en',
      tone: 'friendly',
      subject: 'Following up on {{geoDomain}}',
      previewText: 'Quick follow-up on the domain idea.',
      body: 'Hi {{businessName}} team,\n\nQuick follow-up on {{geoDomain}}. Since it maps to {{niche}} demand in {{cityState}}, I thought it may be useful for a campaign or simple redirect.\n\nShould I send the details?\n\n{{unsubscribeLine}}',
      tags: ['follow-up'],
      variables: { required: ['businessName', 'geoDomain', 'cityState', 'niche', 'unsubscribeUrl'] },
      spamScore: 1,
      deliverabilityScore: 92,
    },
  ];
}

async function ensureDefaultTemplate(userId?: string) {
  const existing = await prisma.template.findFirst({ orderBy: { createdAt: 'asc' } });
  if (existing) return existing;

  const [created] = await prisma.$transaction(defaultTemplates(userId || '').map((template) => prisma.template.create({ data: template })));
  return created;
}

function defaultCompliancePolicy() {
  return {
    unsubscribeRequired: true,
    physicalAddressRequired: true,
    stopOnReply: true,
    stopOnBounce: true,
    stopOnComplaint: true,
    maxDailyPerSender: 100,
    gdprLegitimateInterestReview: true,
  };
}

function randomToken() {
  return randomBytes(18).toString('base64url');
}

function rate(numerator: number, denominator: number) {
  if (!denominator) return 0;
  return Number(((numerator / denominator) * 100).toFixed(1));
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function asString(value: unknown) {
  return typeof value === 'string' ? value : undefined;
}

function extractEmailDomain(email: string) {
  const match = /@([^@\s]+)$/i.exec(email.trim());
  return match?.[1]?.toLowerCase() || '';
}

async function readTxtRecords(name: string) {
  try {
    const records = await resolveTxt(name);
    return records.map((record) => record.join('')).filter(Boolean);
  } catch {
    return [];
  }
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export async function getCampaignEvents(campaignId: string, userId: string, filter?: string, search?: string, page = 1, limit = 20) {
  const where: any = { campaignId };
  if (filter) where.status = filter;
  if (search) {
    where.OR = [
      { toEmail: { contains: search, mode: 'insensitive' } },
      { subject: { contains: search, mode: 'insensitive' } },
    ];
  }

  const [logs, total] = await Promise.all([
    prisma.emailLog.findMany({
      where,
      include: { lead: { select: { businessName: true } } },
      orderBy: { sentAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.emailLog.count({ where }),
  ]);

  const events = logs.map((log) => ({
    id: log.id,
    toEmail: log.toEmail,
    subject: log.subject,
    variant: log.variant,
    status: log.status,
    sentAt: log.sentAt,
    deliveredAt: log.deliveredAt,
    openedAt: log.openedAt,
    clickedAt: log.clickedAt,
    bouncedAt: log.bouncedAt,
    unsubscribedAt: log.unsubscribedAt,
    errorMessage: log.errorMessage,
    businessName: (log.lead as any)?.businessName || log.toEmail,
  }));

  // Aggregate counts
  const counts = {
    sent: logs.filter((l) => l.sentAt).length,
    delivered: logs.filter((l) => l.deliveredAt).length,
    opened: logs.filter((l) => l.openedAt).length,
    clicked: logs.filter((l) => l.clickedAt).length,
    bounced: logs.filter((l) => l.status === 'BOUNCED').length,
    unsubscribed: logs.filter((l) => l.status === 'UNSUBSCRIBED').length,
    complaints: logs.filter((l) => l.status === 'COMPLAINT').length,
  };

  return { events, counts, total, page, limit, totalPages: Math.ceil(total / limit) };
}

async function writeAudit(userId: string | undefined, entityType: string, entityId: string, action: string, payload: Record<string, unknown>) {
  await prisma.auditLog.create({
    data: {
      userId,
      entityType,
      entityId,
      action,
      payload: payload as Prisma.InputJsonObject,
    },
  });
}
