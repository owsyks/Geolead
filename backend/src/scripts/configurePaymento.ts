import { configurePaymentoIpn, paymentoConfigured } from '../services/paymento.js';

async function main() {
  if (!paymentoConfigured()) {
    console.log('[PaymentoSetup] Skipped: Paymento secrets are not configured.');
    return;
  }
  await configurePaymentoIpn();
  console.log('[PaymentoSetup] Signed IPN endpoint configured successfully.');
}

main().catch((error) => {
  console.error('[PaymentoSetup] FAILED:', error instanceof Error ? error.message : 'unknown error');
  process.exitCode = 1;
});
