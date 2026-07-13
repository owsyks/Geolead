import { randomUUID } from 'node:crypto';
import { requestPayment } from '../services/paymento.js';

async function main() {
  await requestPayment({
    orderId: `smoke-${randomUUID()}`,
    amountUSD: 5,
    email: 'verify@geolead.tech',
    returnUrl: 'https://geoai-ashen.vercel.app/pricing',
  });
  console.log('[PaymentoSmoke] Payment request accepted; no funds were charged.');
}

main().catch((error) => {
  console.error('[PaymentoSmoke] FAILED:', error instanceof Error ? error.message : 'unknown error');
  process.exitCode = 1;
});
