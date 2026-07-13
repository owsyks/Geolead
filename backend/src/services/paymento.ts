import { createHmac, timingSafeEqual } from 'node:crypto';

const API_BASE = (process.env.PAYMENTO_API_BASE || 'https://api.paymento.io').replace(/\/+$/, '');
const GATEWAY_BASE = 'https://app.paymento.io/gateway';

interface PaymentoEnvelope<T> {
  success?: boolean;
  message?: string | null;
  body?: T | null;
}

export interface PaymentoVerification {
  token: string;
  orderId: string;
  orderStatus: number;
  additionalData?: Array<{ key?: string | null; value?: string | null }>;
}

function apiKey(): string {
  const value = process.env.PAYMENTO_API_KEY?.trim();
  if (!value) throw new Error('PAYMENTO_NOT_CONFIGURED');
  return value;
}

async function call<T>(path: string, body: unknown): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);
  try {
    const response = await fetch(`${API_BASE}${path}`, {
      method: 'POST',
      headers: { 'Api-Key': apiKey(), 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    const raw = await response.text();
    let parsed: PaymentoEnvelope<T> & { error?: string };
    try {
      parsed = JSON.parse(raw) as PaymentoEnvelope<T> & { error?: string };
    } catch {
      throw new Error(response.ok ? 'PAYMENTO_INVALID_JSON' : `PAYMENTO_HTTP_${response.status}`);
    }
    if (!response.ok) {
      const detail = String(parsed.error || parsed.message || 'request_rejected').replace(/[^a-zA-Z0-9 .:_-]/g, '').slice(0, 160);
      throw new Error(`PAYMENTO_HTTP_${response.status}:${detail}`);
    }
    if (!parsed.success || parsed.body == null) {
      const detail = String(parsed.error || parsed.message || 'empty_response').replace(/[^a-zA-Z0-9 .:_-]/g, '').slice(0, 160);
      throw new Error(`PAYMENTO_REJECTED:${detail}`);
    }
    return parsed.body;
  } finally {
    clearTimeout(timeout);
  }
}

export function paymentoConfigured(): boolean {
  return Boolean(process.env.PAYMENTO_API_KEY?.trim() && process.env.PAYMENTO_IPN_SECRET?.trim());
}

export async function requestPayment(input: {
  orderId: string;
  amountUSD: number;
  email: string;
  returnUrl: string;
}): Promise<{ token: string; gatewayUrl: string }> {
  const token = await call<string>('/v1/payment/request', {
    fiatAmount: input.amountUSD.toFixed(2),
    fiatCurrency: 'USD',
    returnUrl: input.returnUrl,
    orderId: input.orderId,
    riskSpeed: 1,
    emailAddress: input.email,
  });
  if (!/^[A-Za-z0-9_-]{16,128}$/.test(token)) throw new Error('PAYMENTO_INVALID_TOKEN');
  const gateway = new URL(GATEWAY_BASE);
  gateway.searchParams.set('token', token);
  return { token, gatewayUrl: gateway.toString() };
}

export async function verifyPayment(token: string): Promise<PaymentoVerification> {
  if (!/^[A-Za-z0-9_-]{16,128}$/.test(token)) throw new Error('PAYMENTO_INVALID_TOKEN');
  const result = await call<PaymentoVerification>('/v1/payment/verify', { token });
  if (result.token !== token || !result.orderId || !Number.isInteger(result.orderStatus)) {
    throw new Error('PAYMENTO_INVALID_VERIFICATION');
  }
  return result;
}

export async function configurePaymentoIpn(): Promise<void> {
  const configured = process.env.PAYMENTO_IPN_URL?.trim();
  if (!configured) throw new Error('PAYMENTO_IPN_URL_NOT_CONFIGURED');
  const url = new URL(configured);
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) {
    throw new Error('PAYMENTO_IPN_URL_INVALID');
  }
  await call<unknown>('/v1/payment/settings', { ipN_URL: url.toString(), ipN_Method: 1 });
}

export function verifyIpnSignature(rawBody: Buffer, received: string | undefined): boolean {
  const secret = process.env.PAYMENTO_IPN_SECRET?.trim();
  if (!secret || !received || !/^[A-Fa-f0-9]{64}$/.test(received)) return false;
  const expected = createHmac('sha256', secret).update(rawBody).digest('hex').toUpperCase();
  const normalized = received.toUpperCase();
  return timingSafeEqual(Buffer.from(expected, 'ascii'), Buffer.from(normalized, 'ascii'));
}
