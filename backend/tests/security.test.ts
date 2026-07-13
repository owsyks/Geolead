import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { assertSafeUrl, isBlockedAddress } from '../src/services/ssrfGuard.js';
import { validatePasswordStrength } from '../src/services/auth.js';
import { verifyResendWebhook } from '../src/services/webhookSecurity.js';
import { verifyIpnSignature } from '../src/services/paymento.js';
import { cleanGeneratedCopy, scoreSpamRisk } from '../src/services/outboundAi.js';
import { validatePhoneSignals } from '../src/services/contactIntelligence.js';
import {
  campaignEmailLogTenantWhere,
  isConsistentReplyThread,
  ownedEmailLogWhere,
  replyTenantWhere,
} from '../src/security/tenantIsolation.js';

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

test('Paymento IPN requires an uppercase HMAC over the exact raw body', () => {
  const previous = process.env.PAYMENTO_IPN_SECRET;
  const secret = 'paymento-test-secret-with-sufficient-entropy';
  process.env.PAYMENTO_IPN_SECRET = secret;
  try {
    const raw = Buffer.from('{"Token":"abc123","OrderStatus":7}');
    const valid = createHmac('sha256', secret).update(raw).digest('hex').toUpperCase();
    assert.equal(verifyIpnSignature(raw, valid), true);
    assert.equal(verifyIpnSignature(Buffer.from('{"Token":"abc123","OrderStatus":8}'), valid), false);
    assert.equal(verifyIpnSignature(raw, 'not-a-signature'), false);
  } finally {
    if (previous === undefined) delete process.env.PAYMENTO_IPN_SECRET;
    else process.env.PAYMENTO_IPN_SECRET = previous;
  }
});

test('tenant predicates require campaign, lead, and mailbox ownership to agree', () => {
  assert.deepEqual(replyTenantWhere('user-a'), {
    AND: [
      { campaign: { userId: 'user-a' } },
      { lead: { ownerId: 'user-a' } },
      { OR: [{ mailboxId: null }, { mailbox: { userId: 'user-a' } }] },
    ],
  });
  assert.deepEqual(campaignEmailLogTenantWhere('campaign-a', 'user-a'), {
    campaignId: 'campaign-a',
    campaign: { userId: 'user-a' },
  });
  assert.deepEqual(ownedEmailLogWhere('user-a', { providerMessageId: 'message-a' }), {
    AND: [{ campaign: { userId: 'user-a' } }, { providerMessageId: 'message-a' }],
  });
});

test('reply ingestion rejects references from different threads', () => {
  const campaignLead = { id: 'cl-a', campaignId: 'campaign-a', leadId: 'lead-a' };
  assert.equal(isConsistentReplyThread(campaignLead, {
    campaignId: 'campaign-a', leadId: 'lead-a', campaignLeadId: 'cl-a',
  }), true);
  assert.equal(isConsistentReplyThread(campaignLead, {
    campaignId: 'campaign-b', leadId: 'lead-a', campaignLeadId: 'cl-a',
  }), false);
  assert.equal(isConsistentReplyThread(campaignLead, {
    campaignId: 'campaign-a', leadId: 'lead-b', campaignLeadId: 'cl-a',
  }), false);
});

test('AI email output is cleaned and spam-scored before use', () => {
  const cleaned = cleanGeneratedCopy('<b>ACT NOW</b> https://attacker.example/path\u0000 Limited time!!!');
  assert.equal(cleaned.includes('<b>'), false);
  assert.equal(cleaned.includes('http'), false);
  assert.equal(cleaned.includes('\u0000'), false);
  assert.equal(/act now|limited time/i.test(cleaned), false);
  assert.ok(scoreSpamRisk('GUARANTEED ACT NOW BUY NOW') >= 6);
});

test('self-hosted phone validation rejects placeholders and normalizes E.164 signals', () => {
  assert.equal(validatePhoneSignals('0000000000').structurallyValid, false);
  assert.equal(validatePhoneSignals('1111111111').structurallyValid, false);
  assert.deepEqual(validatePhoneSignals('(415) 555-2671'), {
    original: '(415) 555-2671',
    normalized: '+14155552671',
    structurallyValid: true,
    reason: 'Structurally valid phone signal.',
  });
});
