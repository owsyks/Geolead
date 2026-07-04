const PLACEHOLDER_DOMAINS = new Set([
  'example.com',
  'example.net',
  'example.org',
  'example.co',
  'example.io',
  'domain.com',
  'sample.com',
  'sample.net',
  'sample.org',
  'demo.com',
  'demo.net',
  'demo.org',
  'placeholder.com',
  'placeholder.net',
  'placeholder.org',
  'yourdomain.com',
  'yourdomain.net',
  'yourcompany.com',
  'yourcompany.net',
  'yourbusiness.com',
  'yourbusiness.net',
  'mydomain.com',
  'mydomain.net',
  'mycompany.com',
  'mycompany.net',
  'mywebsite.com',
  'mysite.com',
  'test.com',
  'test.net',
  'test.org',
  'invalid.com',
  'fake.com',
  'fake.net',
  'fake.org',
  'noemail.com',
]);

const DISPOSABLE_DOMAINS = new Set([
  'mailinator.com',
  'tempmail.com',
  '10minutemail.com',
  'yopmail.com',
  'guerrillamail.com',
  'sharklasers.com',
  'dispostable.com',
  'getairmail.com',
]);

const PERSONAL_DOMAINS = new Set([
  'gmail.com',
  'yahoo.com',
  'hotmail.com',
  'outlook.com',
  'aol.com',
  'icloud.com',
  'zoho.com',
  'protonmail.com',
  'mail.com',
  'msn.com',
  'live.com',
  'me.com',
  'comcast.net',
  'att.net',
]);

const INVALID_PREFIXES = new Set([
  'noreply',
  'no-reply',
  'donotreply',
  'mailer-daemon',
  'test',
  'fake',
  'demo',
  'example',
  'placeholder',
  'privacy',
  'abuse',
  'user',
  'username',
  'name',
  'firstname',
  'lastname',
  'yourname',
  'sample',
  'null',
  'none',
]);

const PREFERRED_PREFIXES = new Set([
  'info',
  'sales',
  'contact',
  'support',
  'hello',
  'office',
  'jobs',
  'careers',
  'media',
  'press',
  'inquiries',
  'team',
  'service',
  'services',
  'admin',
  'booking',
  'appointments',
  'quotes',
  'estimate',
  'estimates',
]);

const ROLE_OR_BUSINESS_PREFIXES = new Set([
  ...PREFERRED_PREFIXES,
  'owner',
  'manager',
  'operations',
  'customerservice',
  'customer-service',
  'help',
  'work',
  'projects',
  'billing',
  'webmaster',
  'postmaster',
]);

// Website-builder platform infrastructure domains — e.g. Wix embeds its own
// client-side error-tracking DSN key (`<hash>@sentry.wixpress.com`) in every
// site's page source; the email regex matches it because a Sentry DSN is
// shaped exactly like an email address. Real, deliverable domain but never a
// business contact — and it recurs across every unrelated site on the platform.
const TRACKING_INFRASTRUCTURE_DOMAINS = new Set(['wixpress.com']);

// Bare 20+ char hex strings (no separators) are machine-generated tokens/
// keys, not human or role-account local parts.
const HEX_TOKEN_LOCAL_PART = /^[a-f0-9]{20,}$/i;

function isTrackingInfrastructureDomain(domain: string): boolean {
  for (const blocked of TRACKING_INFRASTRUCTURE_DOMAINS) {
    if (domain === blocked || domain.endsWith(`.${blocked}`)) return true;
  }
  return false;
}

export interface EmailCandidate {
  email: string;
  sourcePage?: string;
}

const EMAIL_REGEX = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,24}\b/g;
const OBFUSCATED_EMAIL_REGEX = /\b([A-Za-z0-9._%+-]{2,64})\s*(?:@|\[\s*at\s*\]|\(\s*at\s*\)|\{\s*at\s*\}|\bat\b)\s*([A-Za-z0-9.-]{2,253})\s*(?:\.|\[\s*dot\s*\]|\(\s*dot\s*\)|\{\s*dot\s*\}|\bdot\b)\s*([A-Za-z]{2,24})(?:\s*(?:\.|\[\s*dot\s*\]|\(\s*dot\s*\)|\{\s*dot\s*\}|\bdot\b)\s*([A-Za-z]{2,12}))?\b/gi;

export function normalizeEmail(email: string): string {
  let decoded = email;
  try {
    decoded = decodeURIComponent(decoded);
  } catch {
    decoded = email;
  }

  let normalized = decoded
    .trim()
    .toLowerCase()
    .replace(/^mailto:/i, '')
    .split('?')[0]
    .replace(/\s*(?:\[|\(|\{)\s*at\s*(?:\]|\)|\})\s*/gi, '@')
    .replace(/\s+(?:at)\s+/gi, '@')
    .replace(/\s*(?:\[|\(|\{)\s*dot\s*(?:\]|\)|\})\s*/gi, '.')
    .replace(/\s+(?:dot)\s+/gi, '.')
    .replace(/\s*@\s*/g, '@')
    .replace(/\s*\.\s*/g, '.')
    .replace(/[<>()"'.,;:]+$/g, '')
    .replace(/^[<>()"'.,;:]+/g, '');

  // Strip phone-number fragments that got concatenated onto the local part
  // e.g. "565-1220emailinfo@domain.com" → "emailinfo@domain.com"
  // e.g. "555.123.4567sales@co.com"     → "sales@co.com"
  // e.g. "5551234info@domain.com"       → "info@domain.com"
  // Deliberately conservative: does NOT strip short digit prefixes like "1password"
  const atIdx = normalized.indexOf('@');
  if (atIdx > 0) {
    let local = normalized.slice(0, atIdx);
    const rest = normalized.slice(atIdx);
    local = local
      // Full 10-digit phone: optional +1, (NXX) NXX-XXXX
      .replace(/^\+?1?[-.\s]?\(?\d{3}\)?[-.\s]\d{3}[-.\s]\d{4}/, '')
      // 7-digit phone with separator: NXX-XXXX
      .replace(/^\d{3}[-.\s]\d{4}/, '')
      // Any two separator-joined groups of 3+ digits (e.g. 565-1220)
      .replace(/^\d{3,}[-.\s]\d{3,}/, '')
      // Bare run of 7+ digits (unformatted phone number)
      .replace(/^\d{7,}/, '');
    if (local.length > 0 && local !== normalized.slice(0, atIdx)) {
      normalized = local + rest;
    }
  }

  return normalized;
}

export function extractEmailCandidates(text: string, sourcePage?: string): EmailCandidate[] {
  if (!text) {
    return [];
  }

  const candidates = new Map<string, EmailCandidate>();
  const decodedText = decodeHtmlEntities(text);

  for (const value of [text, decodedText]) {
    for (const match of value.matchAll(EMAIL_REGEX)) {
      addEmailCandidate(candidates, match[0], sourcePage);
    }
  }

  for (const match of decodedText.matchAll(OBFUSCATED_EMAIL_REGEX)) {
    const [, prefix, domain, tld, secondaryTld] = match;
    const email = `${prefix}@${domain}.${tld}${secondaryTld ? `.${secondaryTld}` : ''}`;
    addEmailCandidate(candidates, email, sourcePage);
  }

  return Array.from(candidates.values());
}

export function decodeCloudflareEmail(hex: string): string | null {
  if (!hex || hex.length < 4 || hex.length % 2 !== 0 || !/^[a-f0-9]+$/i.test(hex)) {
    return null;
  }

  const key = parseInt(hex.slice(0, 2), 16);
  let decoded = '';

  for (let i = 2; i < hex.length; i += 2) {
    decoded += String.fromCharCode(parseInt(hex.slice(i, i + 2), 16) ^ key);
  }

  return normalizeEmail(decoded);
}

export function getEmailParts(email: string): { prefix: string; domain: string } | null {
  const cleaned = normalizeEmail(email);
  const parts = cleaned.split('@');
  if (parts.length !== 2) {
    return null;
  }

  const [prefix, domain] = parts;
  if (!prefix || !domain) {
    return null;
  }

  return { prefix, domain: stripSubdomain(domain) };
}

export function isPlaceholderEmail(email: string): boolean {
  const parts = getEmailParts(email);
  if (!parts) {
    return true;
  }

  const { prefix, domain } = parts;
  if (PLACEHOLDER_DOMAINS.has(domain)) {
    return true;
  }

  if (DISPOSABLE_DOMAINS.has(domain)) {
    return true;
  }

  if (isTrackingInfrastructureDomain(domain)) {
    return true;
  }

  if (HEX_TOKEN_LOCAL_PART.test(prefix)) {
    return true;
  }

  if (INVALID_PREFIXES.has(prefix)) {
    return true;
  }

  if (
    prefix.startsWith('test') ||
    prefix.startsWith('fake') ||
    prefix.startsWith('demo') ||
    prefix.startsWith('sample') ||
    prefix.includes('example') ||
    prefix.includes('placeholder')
  ) {
    return true;
  }

  return false;
}

export function isDisposableDomain(domain: string): boolean {
  return DISPOSABLE_DOMAINS.has(stripSubdomain(domain));
}

export function isPersonalDomain(domain: string): boolean {
  return PERSONAL_DOMAINS.has(stripSubdomain(domain));
}

export function isPreferredBusinessPrefix(prefix: string): boolean {
  return PREFERRED_PREFIXES.has(prefix);
}

export function isRoleOrBusinessPrefix(prefix: string): boolean {
  return ROLE_OR_BUSINESS_PREFIXES.has(prefix);
}

export function normalizePhone(phone: string): string | null {
  if (!phone) {
    return null;
  }

  let cleaned = phone.trim().replace(/^tel:/i, '');
  cleaned = cleaned.split(/[;?]/)[0];
  cleaned = cleaned.replace(/\b(?:ext\.?|extension|x)\s*\d+$/i, '').trim();

  const digits = cleaned.replace(/\D/g, '');

  if (digits.length !== 10 && digits.length !== 11) {
    return null;
  }

  if (/^(\d)\1+$/.test(digits)) {
    return null;
  }

  if (/^(?:0123456789|1234567890|9876543210)$/.test(digits)) {
    return null;
  }

  let coreDigits = digits;
  if (digits.length === 11) {
    if (!digits.startsWith('1')) {
      return null;
    }
    coreDigits = digits.slice(1);
  }

  const area = coreDigits.slice(0, 3);
  const exchange = coreDigits.slice(3, 6);
  const line = coreDigits.slice(6, 10);

  if (area[0] < '2' || exchange[0] < '2') {
    return null;
  }

  if (area === '555' || exchange === '555' || area === '000' || exchange === '000' || line === '0000') {
    return null;
  }

  if (digits.length === 10) {
    return formatNorthAmericanPhone(coreDigits);
  }

  if (digits.length === 11) {
    return formatNorthAmericanPhone(coreDigits);
  }

  return null;
}

export function extractPhoneCandidates(text: string, requireContext = true): string[] {
  const phoneRegex = /(?<!\d)((?:\+?1[\s.-]?)?(?:\([2-9]\d{2}\)|[2-9]\d{2})[\s.-][2-9]\d{2}[\s.-]\d{4})(?!\d)/g;
  return Array.from(text.matchAll(phoneRegex))
    .filter((match) => {
      if (!requireContext) {
        return true;
      }

      const start = Math.max(0, match.index - 40);
      const end = Math.min(text.length, match.index + match[1].length + 40);
      const context = text.slice(start, end).toLowerCase();
      return /\b(phone|call|text|tel|contact|estimate|quote|mobile|office|cell)\b/.test(context);
    })
    .map((match) => match[1]);
}

export function normalizePhoneList(phones: string[], maxCount = 1): string[] {
  const seen = new Set<string>();
  const normalized: string[] = [];

  for (const phone of phones) {
    const cleaned = normalizePhone(phone);
    if (!cleaned || seen.has(cleaned)) {
      continue;
    }

    seen.add(cleaned);
    normalized.push(cleaned);

    if (normalized.length >= maxCount) {
      break;
    }
  }

  return normalized;
}

function stripSubdomain(domain: string): string {
  return domain.trim().toLowerCase().replace(/^www\./i, '');
}

function addEmailCandidate(candidates: Map<string, EmailCandidate>, email: string, sourcePage?: string) {
  const normalized = normalizeEmail(email);

  EMAIL_REGEX.lastIndex = 0;
  if (!EMAIL_REGEX.test(normalized)) {
    EMAIL_REGEX.lastIndex = 0;
    return;
  }
  EMAIL_REGEX.lastIndex = 0;

  if (/\.(?:png|jpe?g|gif|svg|webp|css|js|ico|pdf)$/i.test(normalized)) {
    return;
  }

  candidates.set(normalized, { email: normalized, sourcePage });
}

function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&#x([a-f0-9]+);/gi, (_, code) => String.fromCharCode(parseInt(code, 16)))
    .replace(/&commat;|&#64;|&#x40;/gi, '@')
    .replace(/&period;|&#46;|&#x2e;/gi, '.')
    .replace(/&nbsp;/gi, ' ');
}

function formatNorthAmericanPhone(digits: string, international = false): string | null {
  const area = digits.slice(0, 3);
  const exchange = digits.slice(3, 6);
  const line = digits.slice(6, 10);

  if (area === '555' || exchange === '555' || area === '000' || exchange === '000' || line === '0000') {
    return null;
  }

  return international ? `+1 ${area}-${exchange}-${line}` : `(${area}) ${exchange}-${line}`;
}
