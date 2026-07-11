// Billing/subscription routes. Cards run through Paddle Billing (recurring);
// crypto runs through Coinbase Commerce (one-time = a fixed access window).
// Public: GET /plans + the two provider webhooks. Everything else is per-user
// and requires auth. Purchases and status changes are reconciled from webhooks,
// which are signature-verified against the raw request body.
import { Router } from 'express';
import prisma from '../config/db.js';
import { requireAuth } from '../middleware/auth.js';
import { rateLimit } from '../middleware/rateLimit.js';
import { getBillingSummary } from '../services/billing.js';
import { PLANS, PURCHASABLE_TIERS, CRYPTO_ACCESS_DAYS, isTier, planFor, type Tier } from '../config/plans.js';
import {
  paddleConfigured,
  createCheckoutTransaction,
  updateSubscriptionPrice,
  cancelSubscription as cancelPaddleSubscription,
  verifyWebhookSignature as verifyPaddleSignature,
} from '../services/paddle.js';
import {
  coinbaseConfigured,
  createCharge,
  verifyWebhookSignature as verifyCoinbaseSignature,
} from '../services/coinbase.js';

const router = Router();

function frontendUrl(): string {
  return (process.env.FRONTEND_URL || process.env.CORS_ORIGIN || 'http://localhost:3000').replace(/\/+$/, '');
}

// Return the EXACT bytes received (needed for signature verification). Never
// reconstruct from the parsed body — re-stringifying can differ from the wire
// bytes and would let a forged payload pass HMAC. Missing raw body => reject.
function rawBodyOf(req: any): string | null {
  if (req.rawBody instanceof Buffer) return req.rawBody.toString('utf8');
  if (typeof req.rawBody === 'string') return req.rawBody;
  return null;
}

// Reverse-map a Paddle price id back to our tier.
function tierForPaddlePrice(priceId: string | undefined): Tier | null {
  if (!priceId) return null;
  for (const t of PURCHASABLE_TIERS) {
    if (planFor(t).paddlePriceId === priceId) return t;
  }
  return null;
}

// ---- Public plan catalogue ----------------------------------------------
router.get('/plans', (_req, res) => {
  const plans = (Object.keys(PLANS) as Tier[]).map((t) => {
    const p = planFor(t);
    return {
      tier: p.tier,
      label: p.label,
      priceUSD: p.priceUSD,
      purchasable: p.purchasable,
      configured: p.tier === 'trial' ? true : Boolean(p.paddlePriceId),
      limits: {
        searchesPerMonth: p.searchesPerMonth,
        maxDepth: p.maxDepth,
        leadCap: p.leadCap,
        sendsPerDay: p.sendsPerDay,
        senderCap: p.senderCap,
      },
    };
  });
  res.json({
    plans,
    cardConfigured: paddleConfigured(),
    cryptoConfigured: coinbaseConfigured(),
    cryptoAccessDays: CRYPTO_ACCESS_DAYS,
  });
});

// ---- Current user's billing summary -------------------------------------
router.get('/me', requireAuth, async (req, res) => {
  res.json(await getBillingSummary(req.userId!));
});

// ---- Card checkout via Paddle (returns hosted checkout URL) --------------
router.post('/subscribe', requireAuth, rateLimit('billing-subscribe', 20, 15 * 60 * 1000), async (req, res) => {
  const tier = String(req.body?.tier || '');
  if (!isTier(tier) || !PURCHASABLE_TIERS.includes(tier)) {
    return res.status(400).json({ error: 'Choose a valid plan (starter or pro).' });
  }
  if (!paddleConfigured()) {
    return res.status(503).json({ error: 'Card checkout is not configured yet. Please try again later.' });
  }
  const plan = planFor(tier);
  if (!plan.paddlePriceId) {
    return res.status(503).json({ error: `The ${plan.label} plan is not available for purchase yet.` });
  }

  try {
    const checkout = await createCheckoutTransaction({ priceId: plan.paddlePriceId, userId: req.userId!, email: req.userEmail });
    return res.json({ provider: 'paddle', transactionId: checkout.transactionId, checkoutUrl: checkout.checkoutUrl, tier });
  } catch (err: any) {
    console.error('[Billing] Paddle subscribe failed:', err?.response?.data || err?.message);
    return res.status(502).json({ error: 'Could not start card checkout. Please try again.' });
  }
});

// ---- Change plan on an EXISTING Paddle subscription (upgrade/downgrade) ---
// Prorates immediately and keeps a single subscription — never a second charge.
// Crypto plans have no recurring subscription to modify, so callers fall back to
// a fresh /crypto/charge instead.
router.post('/change-plan', requireAuth, rateLimit('billing-change', 20, 15 * 60 * 1000), async (req, res) => {
  const tier = String(req.body?.tier || '');
  if (!isTier(tier) || !PURCHASABLE_TIERS.includes(tier)) {
    return res.status(400).json({ error: 'Choose a valid plan (starter or pro).' });
  }
  const plan = planFor(tier);
  if (!plan.paddlePriceId) {
    return res.status(503).json({ error: `The ${plan.label} plan is not available yet.` });
  }

  const sub = await prisma.subscription.findUnique({ where: { userId: req.userId! } });
  if (!sub || sub.provider !== 'paddle' || !sub.providerSubscriptionId || sub.status !== 'active') {
    // No live card subscription to modify — the client should start a new checkout.
    return res.status(409).json({ error: 'No active card subscription to change.', code: 'NO_ACTIVE_SUBSCRIPTION' });
  }
  if (sub.planTier === tier) {
    return res.status(400).json({ error: `You are already on the ${plan.label} plan.` });
  }

  try {
    await updateSubscriptionPrice(sub.providerSubscriptionId, plan.paddlePriceId);
    // The subscription.updated webhook reconciles tier + period end; reflect the
    // new tier locally right away so the UI updates without waiting on the hook.
    await prisma.subscription.update({ where: { userId: req.userId! }, data: { planTier: tier } });
    await prisma.user.update({ where: { id: req.userId! }, data: { plan: tier } });
    return res.json({ ok: true, tier });
  } catch (err: any) {
    console.error('[Billing] Paddle change-plan failed:', err?.response?.data || err?.message);
    return res.status(502).json({ error: 'Could not change your plan. Please try again.' });
  }
});

// ---- Crypto checkout via Coinbase Commerce (returns hosted charge URL) ---
router.post('/crypto/charge', requireAuth, rateLimit('billing-crypto', 20, 15 * 60 * 1000), async (req, res) => {
  const tier = String(req.body?.tier || '');
  if (!isTier(tier) || !PURCHASABLE_TIERS.includes(tier)) {
    return res.status(400).json({ error: 'Choose a valid plan (starter or pro).' });
  }
  if (!coinbaseConfigured()) {
    return res.status(503).json({ error: 'Crypto checkout is not configured yet. Please try again later.' });
  }
  const plan = planFor(tier);

  try {
    const charge = await createCharge({
      name: `GeoLead AI — ${plan.label}`,
      description: `${CRYPTO_ACCESS_DAYS} days of the ${plan.label} plan.`,
      amountUSD: plan.priceUSD,
      userId: req.userId!,
      tier,
      redirectUrl: `${frontendUrl()}/billing?crypto=success`,
      cancelUrl: `${frontendUrl()}/pricing?crypto=cancelled`,
    });
    return res.json({ provider: 'coinbase', chargeId: charge.chargeId, checkoutUrl: charge.hostedUrl, tier });
  } catch (err: any) {
    console.error('[Billing] Coinbase charge failed:', err?.response?.data || err?.message);
    return res.status(502).json({ error: 'Could not start crypto checkout. Please try again.' });
  }
});

// ---- Cancel (card subscriptions only) -----------------------------------
router.post('/cancel', requireAuth, async (req, res) => {
  const sub = await prisma.subscription.findUnique({ where: { userId: req.userId! } });
  if (!sub) return res.status(404).json({ error: 'No active subscription to cancel.' });
  if (sub.provider !== 'paddle' || !sub.providerSubscriptionId) {
    return res.status(400).json({ error: 'Crypto plans are one-time and simply lapse — nothing to cancel.' });
  }
  try {
    await cancelPaddleSubscription(sub.providerSubscriptionId);
    await prisma.subscription.update({ where: { userId: req.userId! }, data: { cancelAtPeriodEnd: true } });
    return res.json({ ok: true, message: 'Your plan will not renew. Access continues until the end of the period.' });
  } catch (err: any) {
    console.error('[Billing] cancel failed:', err?.response?.data || err?.message);
    return res.status(502).json({ error: 'Could not cancel with Paddle. Please try again.' });
  }
});

// ---- Paddle webhook (public, signature-verified) ------------------------
router.post('/webhook/paddle', async (req, res) => {
  const raw = rawBodyOf(req);
  if (!raw || !verifyPaddleSignature(raw, req.headers['paddle-signature'] as string | undefined)) {
    return res.status(400).json({ error: 'Invalid webhook signature.' });
  }
  const event = req.body as { event_type?: string; data?: any };
  const type = event?.event_type || '';
  const data = event?.data || {};
  const eventId = String((req.body as any)?.event_id || (req.body as any)?.notification_id || '');
  if (!eventId) return res.status(400).json({ error: 'Webhook event id is required.' });

  try {
    const userId: string | undefined = data.custom_data?.userId;
    const subscriptionId: string | undefined = data.id;
    const priceId: string | undefined = data.items?.[0]?.price?.id;
    const tier = tierForPaddlePrice(priceId) || undefined;
    const periodEnd = data.current_billing_period?.ends_at || data.next_billed_at;

    // Resolve the target user: prefer custom_data, else an existing local row.
    let localUserId = userId;
    if (!localUserId && subscriptionId) {
      const local = await prisma.subscription.findUnique({ where: { providerSubscriptionId: subscriptionId } });
      localUserId = local?.userId;
    }
    if (!localUserId) {
      console.warn(`[Billing] Paddle webhook ${type} without a resolvable user.`);
      return res.json({ received: true });
    }
    if (!(await claimBillingEvent('paddle', eventId, type, localUserId))) return res.json({ received: true, duplicate: true });

    switch (type) {
      case 'subscription.activated':
      case 'subscription.created':
      case 'subscription.updated':
      case 'transaction.completed':
        await applyPaddleState(localUserId, tier, subscriptionId, data.customer_id, 'active', periodEnd, data);
        break;
      case 'subscription.past_due':
        await applyPaddleState(localUserId, tier, subscriptionId, data.customer_id, 'past_due', periodEnd, data);
        break;
      case 'subscription.canceled':
        await applyPaddleState(localUserId, tier, subscriptionId, data.customer_id, 'canceled', periodEnd, data);
        break;
      default:
        break;
    }
    return res.json({ received: true });
  } catch (err: any) {
    console.error('[Billing] Paddle webhook handling failed:', err?.message);
    return res.json({ received: true, error: 'handling_failed' });
  }
});

// ---- Coinbase Commerce webhook (public, signature-verified) -------------
router.post('/webhook/coinbase', async (req, res) => {
  const raw = rawBodyOf(req);
  if (!raw || !verifyCoinbaseSignature(raw, req.headers['x-cc-webhook-signature'] as string | undefined)) {
    return res.status(400).json({ error: 'Invalid webhook signature.' });
  }
  const event = req.body?.event as { type?: string; data?: any };
  const type = event?.type || '';
  const data = event?.data || {};
  const eventId = String((event as any)?.id || data?.id || '');
  if (!eventId) return res.status(400).json({ error: 'Webhook event id is required.' });

  try {
    const userId: string | undefined = data.metadata?.userId;
    const tierRaw = data.metadata?.tier;
    const tier = isTier(tierRaw) && PURCHASABLE_TIERS.includes(tierRaw) ? (tierRaw as Tier) : null;
    if (!userId || !tier) {
      console.warn(`[Billing] Coinbase webhook ${type} missing userId/tier.`);
      return res.json({ received: true });
    }
    if (!(await claimBillingEvent('coinbase', eventId, type, userId))) return res.json({ received: true, duplicate: true });

    // Grant access on confirmed/resolved payments. Idempotent: extends from the
    // later of now / existing period end so a re-delivered webhook won't shrink it.
    if (type === 'charge:confirmed' || type === 'charge:resolved') {
      const exists = await prisma.user.findUnique({ where: { id: userId }, select: { id: true } });
      if (!exists) {
        console.warn(`[Billing] Coinbase webhook ${type} for unknown user ${userId}.`);
        return res.json({ received: true });
      }
      await applyCryptoGrant(userId, tier, data.id, data);
    }
    return res.json({ received: true });
  } catch (err: any) {
    console.error('[Billing] Coinbase webhook handling failed:', err?.message);
    return res.json({ received: true, error: 'handling_failed' });
  }
});

async function claimBillingEvent(provider: string, externalId: string, type: string, userId: string): Promise<boolean> {
  try {
    await prisma.webhookEvent.create({
      data: { provider, externalId, type, userId, payload: { type }, processed: true },
    });
    return true;
  } catch (error: any) {
    if (error?.code === 'P2002') return false;
    throw error;
  }
}

// Reconcile a Paddle subscription status into our Subscription + User. Idempotent.
async function applyPaddleState(
  userId: string,
  tier: Tier | undefined,
  subscriptionId: string | undefined,
  customerId: string | undefined,
  status: string,
  periodEndIso: string | undefined,
  raw: unknown
) {
  const active = status === 'active';
  const currentPeriodEnd = periodEndIso ? new Date(periodEndIso) : undefined;
  const effectiveTier = tier ?? ((await prisma.subscription.findUnique({ where: { userId } }))?.planTier as Tier | undefined) ?? 'starter';

  await prisma.subscription.upsert({
    where: { userId },
    update: {
      provider: 'paddle',
      providerSubscriptionId: subscriptionId,
      providerCustomerId: customerId,
      planTier: effectiveTier,
      status,
      currentPeriodEnd: currentPeriodEnd ?? undefined,
      rawState: raw as any,
    },
    create: {
      userId,
      provider: 'paddle',
      providerSubscriptionId: subscriptionId,
      providerCustomerId: customerId,
      planTier: effectiveTier,
      status,
      currentPeriodEnd: currentPeriodEnd ?? undefined,
      rawState: raw as any,
    },
  });

  await prisma.user.update({
    where: { id: userId },
    data: {
      plan: active ? effectiveTier : 'trial',
      planStatus: active ? 'active' : status === 'past_due' ? 'past_due' : 'canceled',
      currentPeriodEnd: currentPeriodEnd ?? undefined,
    },
  });
}

// Grant CRYPTO_ACCESS_DAYS of the tier from a confirmed crypto charge. Idempotent.
async function applyCryptoGrant(userId: string, tier: Tier, chargeId: string, raw: unknown) {
  const existing = await prisma.user.findUnique({ where: { id: userId }, select: { currentPeriodEnd: true } });
  const base = existing?.currentPeriodEnd && existing.currentPeriodEnd > new Date() ? existing.currentPeriodEnd : new Date();
  const newEnd = new Date(base.getTime() + CRYPTO_ACCESS_DAYS * 24 * 3600 * 1000);

  await prisma.subscription.upsert({
    where: { userId },
    update: { provider: 'coinbase', providerSubscriptionId: chargeId, planTier: tier, status: 'active', currentPeriodEnd: newEnd, cancelAtPeriodEnd: false, rawState: raw as any },
    create: { userId, provider: 'coinbase', providerSubscriptionId: chargeId, planTier: tier, status: 'active', currentPeriodEnd: newEnd, rawState: raw as any },
  });

  await prisma.user.update({
    where: { id: userId },
    data: { plan: tier, planStatus: 'active', currentPeriodEnd: newEnd },
  });
}

export default router;
