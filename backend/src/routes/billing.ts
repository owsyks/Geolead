import { Router } from 'express';
import { Prisma } from '@prisma/client';
import prisma from '../config/db.js';
import { requireAuth, requireVerifiedEmail } from '../middleware/auth.js';
import { rateLimit } from '../middleware/rateLimit.js';
import { getBillingSummary } from '../services/billing.js';
import { PLANS, PURCHASABLE_TIERS, CRYPTO_ACCESS_DAYS, isTier, planFor, type Tier } from '../config/plans.js';
import { paymentoConfigured, requestPayment, verifyIpnSignature, verifyPayment } from '../services/paymento.js';

const router = Router();
const DAY_MS = 24 * 60 * 60 * 1000;

function frontendUrl(): string {
  return (process.env.FRONTEND_URL || process.env.CORS_ORIGIN || 'http://localhost:3000').split(',')[0].trim().replace(/\/+$/, '');
}

function rawBodyOf(req: any): Buffer | null {
  return req.rawBody instanceof Buffer ? req.rawBody : null;
}

router.get('/plans', (_req, res) => {
  const configured = paymentoConfigured();
  const plans = (Object.keys(PLANS) as Tier[]).map((tier) => {
    const plan = planFor(tier);
    return {
      tier: plan.tier,
      label: plan.label,
      priceUSD: plan.priceUSD,
      purchasable: plan.purchasable,
      configured: tier === 'trial' || configured,
      limits: {
        searchesPerMonth: plan.searchesPerMonth,
        maxDepth: plan.maxDepth,
        leadCap: plan.leadCap,
        sendsPerDay: plan.sendsPerDay,
        senderCap: plan.senderCap,
      },
    };
  });
  return res.json({ plans, cryptoConfigured: configured, cryptoAccessDays: CRYPTO_ACCESS_DAYS });
});

router.get('/me', requireAuth, async (req, res) => {
  return res.json(await getBillingSummary(req.userId!));
});

router.post('/paymento/checkout', requireAuth, requireVerifiedEmail, rateLimit('billing-paymento', 10, 15 * 60 * 1000), async (req, res) => {
  const tier = String(req.body?.tier || '');
  if (!isTier(tier) || !PURCHASABLE_TIERS.includes(tier)) {
    return res.status(400).json({ error: 'Choose a valid plan (starter or pro).' });
  }
  if (!paymentoConfigured()) return res.status(503).json({ error: 'Crypto checkout is not configured yet.' });

  const user = await prisma.user.findUnique({
    where: { id: req.userId! },
    select: { email: true, plan: true, planStatus: true, currentPeriodEnd: true },
  });
  if (!user) return res.status(404).json({ error: 'User not found.' });
  const activePro = user.plan === 'pro' && user.planStatus === 'active' && (!user.currentPeriodEnd || user.currentPeriodEnd > new Date());
  if (tier === 'starter' && activePro) {
    return res.status(409).json({ error: 'Pro access cannot be downgraded while it is active. Choose Pro or wait until the current access period ends.', code: 'ACTIVE_PRO_DOWNGRADE_BLOCKED' });
  }

  const plan = planFor(tier);
  const attempt = await prisma.paymentAttempt.create({
    data: {
      userId: req.userId!,
      tier,
      amountCents: Math.round(plan.priceUSD * 100),
      status: 'creating',
      expiresAt: new Date(Date.now() + DAY_MS),
    },
  });

  try {
    const payment = await requestPayment({
      orderId: attempt.id,
      amountUSD: plan.priceUSD,
      email: user.email,
      returnUrl: `${frontendUrl()}/billing?payment=return`,
    });
    await prisma.paymentAttempt.update({ where: { id: attempt.id }, data: { providerToken: payment.token, status: 'pending' } });
    return res.json({ provider: 'paymento', checkoutUrl: payment.gatewayUrl, tier });
  } catch (error) {
    await prisma.paymentAttempt.update({ where: { id: attempt.id }, data: { status: 'creation_failed' } }).catch(() => {});
    console.error('[Billing] Paymento checkout creation failed:', error instanceof Error ? error.message : 'unknown');
    return res.status(502).json({ error: 'Could not start crypto checkout. Please try again.' });
  }
});

router.post('/webhook/paymento', async (req, res) => {
  const raw = rawBodyOf(req);
  const signature = req.get('x-hmac-sha256-signature');
  if (!raw || !verifyIpnSignature(raw, signature)) {
    return res.status(400).json({ error: 'Invalid webhook signature.' });
  }

  const token = String(req.body?.Token ?? req.body?.token ?? '');
  const callbackOrderId = String(req.body?.OrderId ?? req.body?.orderId ?? '');
  const paymentId = String(req.body?.PaymentId ?? req.body?.paymentId ?? '');
  if (!token || !callbackOrderId) return res.status(400).json({ error: 'Invalid Paymento callback.' });

  try {
    const verification = await verifyPayment(token);
    if (verification.token !== token || verification.orderId !== callbackOrderId) {
      return res.status(400).json({ error: 'Payment verification mismatch.' });
    }
    const attempt = await prisma.paymentAttempt.findFirst({ where: { id: verification.orderId, providerToken: token } });
    if (!attempt) return res.status(404).json({ error: 'Unknown payment order.' });
    if (attempt.amountCents !== Math.round(planFor(attempt.tier as Tier).priceUSD * 100)) {
      return res.status(409).json({ error: 'Stored payment amount does not match the plan catalogue.' });
    }

    const status = verification.orderStatus;
    if (status !== 7 && status !== 8) {
      await prisma.paymentAttempt.update({
        where: { id: attempt.id },
        data: { providerStatus: status, providerPaymentId: paymentId || undefined, status: paymentStatus(status) },
      });
      return res.json({ received: true, fulfilled: false });
    }

    await fulfillPayment(attempt.id, token, paymentId, status);
    return res.json({ received: true, fulfilled: true });
  } catch (error) {
    console.error('[Billing] Paymento IPN processing failed:', error instanceof Error ? error.message : 'unknown');
    // Non-2xx is intentional: Paymento must retry after transient API/DB faults.
    return res.status(502).json({ error: 'Payment verification is temporarily unavailable.' });
  }
});

function paymentStatus(status: number): string {
  return ({ 0: 'initialized', 1: 'pending', 2: 'partial', 3: 'confirming', 4: 'expired', 5: 'canceled', 7: 'paid', 8: 'approved', 9: 'rejected' } as Record<number, string>)[status] || 'unknown';
}

async function fulfillPayment(attemptId: string, token: string, paymentId: string, providerStatus: number): Promise<void> {
  for (let retry = 0; retry < 3; retry += 1) {
    try {
      await prisma.$transaction(async (tx) => {
        const attempt = await tx.paymentAttempt.findUnique({ where: { id: attemptId } });
        if (!attempt || attempt.providerToken !== token) throw new Error('PAYMENT_ATTEMPT_MISMATCH');
        if (attempt.processedAt) return;
        if (!isTier(attempt.tier) || !PURCHASABLE_TIERS.includes(attempt.tier)) throw new Error('INVALID_STORED_TIER');

        const user = await tx.user.findUnique({ where: { id: attempt.userId }, select: { plan: true, planStatus: true, currentPeriodEnd: true } });
        if (!user) throw new Error('PAYMENT_USER_MISSING');
        const now = new Date();
        const existingActive = user.planStatus === 'active' && (!user.currentPeriodEnd || user.currentPeriodEnd > now);
        // A Starter order that races with a Pro purchase can never downgrade the
        // account: it extends the stronger Pro entitlement instead.
        const effectiveTier: Tier = existingActive && user.plan === 'pro' ? 'pro' : attempt.tier;
        const base = user.currentPeriodEnd && user.currentPeriodEnd > now ? user.currentPeriodEnd : now;
        const newEnd = new Date(base.getTime() + CRYPTO_ACCESS_DAYS * DAY_MS);

        await tx.subscription.upsert({
          where: { userId: attempt.userId },
          update: { provider: 'paymento', providerSubscriptionId: token, planTier: effectiveTier, status: 'active', currentPeriodEnd: newEnd, cancelAtPeriodEnd: false, rawState: { paymentAttemptId: attempt.id, providerStatus } },
          create: { userId: attempt.userId, provider: 'paymento', providerSubscriptionId: token, planTier: effectiveTier, status: 'active', currentPeriodEnd: newEnd, rawState: { paymentAttemptId: attempt.id, providerStatus } },
        });
        await tx.user.update({ where: { id: attempt.userId }, data: { plan: effectiveTier, planStatus: 'active', currentPeriodEnd: newEnd } });
        await tx.paymentAttempt.update({ where: { id: attempt.id }, data: { status: 'fulfilled', providerStatus, providerPaymentId: paymentId || undefined, processedAt: now } });
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
      return;
    } catch (error: any) {
      if (error?.code === 'P2034' && retry < 2) continue;
      throw error;
    }
  }
}

export default router;
