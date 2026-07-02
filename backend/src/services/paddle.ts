// Paddle Billing API client (cards / recurring subscriptions). Creates a hosted
// checkout transaction, cancels a subscription, and verifies webhook signatures.
// Sandbox vs live is chosen by PADDLE_ENV. All calls throw on misconfig or
// non-2xx so the billing routes can fail closed rather than fake a purchase.
import { createHmac, timingSafeEqual } from 'node:crypto';
import axios from 'axios';

function baseUrl(): string {
  return (process.env.PADDLE_ENV || 'sandbox').toLowerCase() === 'live'
    ? 'https://api.paddle.com'
    : 'https://sandbox-api.paddle.com';
}

export function paddleConfigured(): boolean {
  return Boolean(process.env.PADDLE_API_KEY);
}

function apiKey(): string {
  const key = process.env.PADDLE_API_KEY;
  if (!key) throw new Error('Paddle is not configured (PADDLE_API_KEY).');
  return key;
}

export interface CreatedCheckout {
  transactionId: string;
  checkoutUrl: string | null;
}

// Create a transaction for a Paddle price and return its hosted checkout URL.
// Requires a default payment link configured in the Paddle dashboard (Checkout
// settings) for `checkout.url` to be populated. custom_data carries our userId
// so the webhook can reconcile the purchase back to the account.
export async function createCheckoutTransaction(opts: {
  priceId: string;
  userId: string;
  email?: string;
}): Promise<CreatedCheckout> {
  const res = await axios.post(
    `${baseUrl()}/transactions`,
    {
      items: [{ price_id: opts.priceId, quantity: 1 }],
      custom_data: { userId: opts.userId },
      ...(opts.email ? { customer: { email: opts.email } } : {}),
    },
    { headers: { Authorization: `Bearer ${apiKey()}`, 'Content-Type': 'application/json' }, timeout: 15000 }
  );
  const data = (res.data as any)?.data ?? {};
  return { transactionId: data.id, checkoutUrl: data.checkout?.url ?? null };
}

// Switch an existing subscription to a different price (tier change), prorating
// the difference and charging/crediting immediately. This is the correct way to
// upgrade/downgrade — it does NOT create a second subscription.
export async function updateSubscriptionPrice(subscriptionId: string, priceId: string): Promise<void> {
  await axios.patch(
    `${baseUrl()}/subscriptions/${subscriptionId}`,
    {
      items: [{ price_id: priceId, quantity: 1 }],
      proration_billing_mode: 'prorated_immediately',
    },
    { headers: { Authorization: `Bearer ${apiKey()}`, 'Content-Type': 'application/json' }, timeout: 15000 }
  );
}

export async function cancelSubscription(subscriptionId: string): Promise<void> {
  // effective_from=next_billing_period → cancel at period end (keep access until then).
  await axios.post(
    `${baseUrl()}/subscriptions/${subscriptionId}/cancel`,
    { effective_from: 'next_billing_period' },
    { headers: { Authorization: `Bearer ${apiKey()}`, 'Content-Type': 'application/json' }, timeout: 15000 }
  );
}

// Verify a Paddle webhook. Header format: "ts=<unix>;h1=<hex hmac>". The signed
// payload is `${ts}:${rawBody}` HMAC-SHA256 with the notification secret. Needs
// the RAW request body (not the parsed object). Fails closed on any error.
export function verifyWebhookSignature(rawBody: string, signatureHeader: string | undefined): boolean {
  const secret = process.env.PADDLE_WEBHOOK_SECRET;
  if (!secret || !signatureHeader) return false;
  try {
    const parts = Object.fromEntries(
      signatureHeader.split(';').map((kv) => {
        const [k, v] = kv.split('=');
        return [k?.trim(), v?.trim()];
      })
    ) as { ts?: string; h1?: string };
    if (!parts.ts || !parts.h1) return false;

    const expected = createHmac('sha256', secret).update(`${parts.ts}:${rawBody}`).digest('hex');
    const a = Buffer.from(expected);
    const b = Buffer.from(parts.h1);
    return a.length === b.length && timingSafeEqual(a, b);
  } catch (err: any) {
    console.error('[Paddle] Webhook verification failed:', err?.message);
    return false;
  }
}
