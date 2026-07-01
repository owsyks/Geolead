// Coinbase Commerce client (crypto, one-time payments). Creates a hosted charge
// and verifies webhook signatures. A confirmed charge grants CRYPTO_ACCESS_DAYS
// of the purchased tier (crypto can't auto-charge, so it's pay-as-you-go).
import { createHmac, timingSafeEqual } from 'node:crypto';
import axios from 'axios';

const API_BASE = 'https://api.commerce.coinbase.com';

export function coinbaseConfigured(): boolean {
  return Boolean(process.env.COINBASE_COMMERCE_API_KEY);
}

function apiKey(): string {
  const key = process.env.COINBASE_COMMERCE_API_KEY;
  if (!key) throw new Error('Coinbase Commerce is not configured (COINBASE_COMMERCE_API_KEY).');
  return key;
}

export interface CreatedCharge {
  chargeId: string;
  hostedUrl: string;
}

// Create a fixed-price charge. metadata carries our userId + tier so the webhook
// can grant access to the right account. redirect/cancel URLs bounce the user
// back into the app after paying.
export async function createCharge(opts: {
  name: string;
  description: string;
  amountUSD: number;
  userId: string;
  tier: string;
  redirectUrl: string;
  cancelUrl: string;
}): Promise<CreatedCharge> {
  const res = await axios.post(
    `${API_BASE}/charges`,
    {
      name: opts.name,
      description: opts.description,
      pricing_type: 'fixed_price',
      local_price: { amount: opts.amountUSD.toFixed(2), currency: 'USD' },
      metadata: { userId: opts.userId, tier: opts.tier },
      redirect_url: opts.redirectUrl,
      cancel_url: opts.cancelUrl,
    },
    { headers: { 'X-CC-Api-Key': apiKey(), 'X-CC-Version': '2018-03-22', 'Content-Type': 'application/json' }, timeout: 15000 }
  );
  const data = (res.data as any)?.data ?? {};
  return { chargeId: data.id, hostedUrl: data.hosted_url };
}

// Verify a Coinbase Commerce webhook via the X-CC-Webhook-Signature header
// (HMAC-SHA256 of the RAW body with the shared secret). Fails closed.
export function verifyWebhookSignature(rawBody: string, signature: string | undefined): boolean {
  const secret = process.env.COINBASE_COMMERCE_WEBHOOK_SECRET;
  if (!secret || !signature) return false;
  try {
    const expected = createHmac('sha256', secret).update(rawBody).digest('hex');
    const a = Buffer.from(expected);
    const b = Buffer.from(signature);
    return a.length === b.length && timingSafeEqual(a, b);
  } catch (err: any) {
    console.error('[Coinbase] Webhook verification failed:', err?.message);
    return false;
  }
}
