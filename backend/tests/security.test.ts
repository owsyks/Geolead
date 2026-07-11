import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { assertSafeUrl, isBlockedAddress } from '../src/services/ssrfGuard.js';
import { validatePasswordStrength } from '../src/services/auth.js';
import { verifyResendWebhook } from '../src/services/webhookSecurity.js';

test('SSRF guard rejects private and metadata address families', async () => {
  for (const address of ['127.0.0.1', '10.0.0.1', '169.254.169.254', '192.168.1.1']) {
    assert.equal(isBlockedAddress(address, 4), true, address);
    await assert.rejects(() => assertSafeUrl(`http://${address}/`));
  }
  for (const address of ['::1', 'fd00::1', 'fe80::1', 'ff02::1']) {
    assert.equal(isBlockedAddress(address, 6), true, address);
  }
});

test('password validation bounds hashing work and complexity', () => {
  assert.match(validatePasswordStrength('short') || '', /at least/);
  assert.match(validatePasswordStrength(`Aa1${'x'.repeat(130)}`) || '', /128/);
  assert.equal(validatePasswordStrength('CorrectHorse9'), null);
});

test('Resend webhook signatures require an authentic fresh raw body', () => {
  const keyBytes = Buffer.from('01234567890123456789012345678901');
  const secret = `whsec_${keyBytes.toString('base64')}`;
  const id = 'msg_security_test';
  const timestamp = String(Math.floor(Date.now() / 1000));
  const rawBody = Buffer.from('{"type":"email.delivered"}');
  const signature = createHmac('sha256', keyBytes).update(`${id}.${timestamp}.${rawBody.toString('utf8')}`).digest('base64');
  const headers: Record<string, string> = { 'svix-id': id, 'svix-timestamp': timestamp, 'svix-signature': `v1,${signature}` };
  const req = { get: (name: string) => headers[name.toLowerCase()], rawBody, body: {} } as any;
  assert.equal(verifyResendWebhook(req, secret).valid, true);
  req.rawBody = Buffer.from('{"type":"email.bounced"}');
  assert.equal(verifyResendWebhook(req, secret).valid, false);
});
