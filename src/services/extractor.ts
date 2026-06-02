import { resolve4, resolve6, resolveMx } from 'node:dns/promises';
import {
  isDisposableDomain,
  isPersonalDomain,
  isPlaceholderEmail,
  isPreferredBusinessPrefix,
  isRoleOrBusinessPrefix,
  normalizeEmail,
} from './contactUtils.js';

export interface ValidatedEmail {
  email: string;
  status: 'VALID' | 'RISKY' | 'INVALID';
  confidenceScore: number; // 0.0 to 1.0
  sourcePage?: string;
}

type MailCheckStatus = 'ACCEPTS_MAIL' | 'NO_MAIL_HOST' | 'UNKNOWN';

const mailCheckCache = new Map<string, Promise<MailCheckStatus>>();

/**
 * Validates and ranks an email address.
 */
export async function validateEmail(email: string, sourcePage?: string): Promise<ValidatedEmail> {
  const cleanedEmail = normalizeEmail(email);
  
  // 1. Basic Regex syntax check
  const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,24}$/;
  if (!emailRegex.test(cleanedEmail)) {
    return {
      email: cleanedEmail,
      status: 'INVALID',
      confidenceScore: 0.0,
      sourcePage
    };
  }

  const [prefix, domain] = cleanedEmail.split('@');
  if (!prefix || !domain) {
    return {
      email: cleanedEmail,
      status: 'INVALID',
      confidenceScore: 0.0,
      sourcePage
    };
  }

  // 2. Filter out fake/placeholder/test emails
  if (
    isPlaceholderEmail(cleanedEmail) ||
    domain.includes('example.') ||
    domain.endsWith('.test') ||
    domain.endsWith('.invalid') ||
    domain.endsWith('.localhost')
  ) {
    return {
      email: cleanedEmail,
      status: 'INVALID',
      confidenceScore: 0.1,
      sourcePage
    };
  }

  // 3. Filter disposable email providers
  if (isDisposableDomain(domain)) {
    return {
      email: cleanedEmail,
      status: 'INVALID',
      confidenceScore: 0.1,
      sourcePage
    };
  }

  // 4. Calculate Confidence Score & Status
  let confidenceScore = 0.5; // Start at baseline 50%
  let status: 'VALID' | 'RISKY' | 'INVALID' = 'VALID';
  const mailCheckStatus = await getDomainMailStatus(domain);
  if (mailCheckStatus === 'NO_MAIL_HOST') {
    return {
      email: cleanedEmail,
      status: 'INVALID',
      confidenceScore: 0.2,
      sourcePage
    };
  }

  if (mailCheckStatus === 'UNKNOWN') {
    confidenceScore -= 0.1;
  } else {
    confidenceScore += 0.05;
  }

  // Check if it's a preferred business prefix
  if (isPreferredBusinessPrefix(prefix)) {
    confidenceScore += 0.3; // High trust business mailbox
  }

  if (!isRoleOrBusinessPrefix(prefix) && !/^[a-z]+[._-]?[a-z]+$/.test(prefix)) {
    confidenceScore -= 0.15;
  }

  // Check if it's a personal domain
  if (isPersonalDomain(domain)) {
    // We want to avoid/flag personal emails as RISKY
    status = 'RISKY';
    confidenceScore -= 0.2; // Penalize personal addresses
  } else {
    // It's a custom domain email!
    confidenceScore += 0.2;
  }

  // Check prefix length (extremely short prefixes like a@domain.com are risky unless verified)
  if (prefix.length <= 2) {
    confidenceScore -= 0.1;
  }

  // Clamp confidence score between 0.0 and 1.0
  confidenceScore = Math.max(0.0, Math.min(1.0, parseFloat(confidenceScore.toFixed(2))));

  // Adjust status based on score thresholds if not already marked RISKY
  if (status !== 'RISKY') {
    if (confidenceScore >= 0.7) {
      status = 'VALID';
    } else if (confidenceScore >= 0.4) {
      status = 'RISKY';
    } else {
      status = 'INVALID';
    }
  }

  return {
    email: cleanedEmail,
    status,
    confidenceScore,
    sourcePage
  };
}

/**
 * Validates a list of raw email structures, deduplicates, and keeps every usable discovered email.
 */
export async function validateAndCleanEmails(
  rawEmails: { email: string; sourcePage?: string }[]
): Promise<ValidatedEmail[]> {
  const normalizedRawEmails = rawEmails
    .map(item => ({ email: normalizeEmail(item.email), sourcePage: item.sourcePage }))
    .filter(item => item.email.length > 0);
  const validated = await Promise.all(
    normalizedRawEmails.map(item => validateEmail(item.email, item.sourcePage))
  );

  // Deduplicate by email address, keeping the higher confidence one.
  const emailMap = new Map<string, ValidatedEmail>();
  validated
    .filter(item => item.status !== 'INVALID')
    .forEach(item => {
      const existing = emailMap.get(item.email);
      if (!existing || shouldReplaceEmail(existing, item)) {
        emailMap.set(item.email, item);
      }
    });

  return Array.from(emailMap.values()).sort((a, b) => b.confidenceScore - a.confidenceScore);
}

function shouldReplaceEmail(existing: ValidatedEmail, next: ValidatedEmail) {
  const existingRank = existing.status === 'VALID' ? 2 : existing.status === 'RISKY' ? 1 : 0;
  const nextRank = next.status === 'VALID' ? 2 : next.status === 'RISKY' ? 1 : 0;

  return nextRank > existingRank || (nextRank === existingRank && next.confidenceScore > existing.confidenceScore);
}

async function getDomainMailStatus(domain: string): Promise<MailCheckStatus> {
  const normalizedDomain = domain.trim().toLowerCase();
  if (!mailCheckCache.has(normalizedDomain)) {
    mailCheckCache.set(normalizedDomain, domainMailStatus(normalizedDomain));
  }

  return mailCheckCache.get(normalizedDomain)!;
}

async function domainMailStatus(domain: string): Promise<MailCheckStatus> {
  try {
    const records = await withTimeout(resolveMx(domain), 2500);
    if (records.length > 0) {
      return 'ACCEPTS_MAIL';
    }
  } catch (error) {
    if (!isDnsMiss(error)) {
      return 'UNKNOWN';
    }
  }

  const hostStatus = await domainHasAddress(domain);
  if (hostStatus === true) {
    return 'ACCEPTS_MAIL';
  }

  return hostStatus === false ? 'NO_MAIL_HOST' : 'UNKNOWN';
}

async function domainHasAddress(domain: string): Promise<boolean | 'UNKNOWN'> {
  const checks = await Promise.allSettled([
    withTimeout(resolve4(domain), 2500),
    withTimeout(resolve6(domain), 2500),
  ]);

  if (checks.some((check) => check.status === 'fulfilled' && check.value.length > 0)) {
    return true;
  }

  if (checks.every((check) => check.status === 'rejected' && isDnsMiss(check.reason))) {
    return false;
  }

  return 'UNKNOWN';
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let timeout: NodeJS.Timeout | undefined;

  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timeout = setTimeout(() => reject(new Error('DNS lookup timed out')), timeoutMs);
      }),
    ]);
  } finally {
    if (timeout) {
      clearTimeout(timeout);
    }
  }
}

function isDnsMiss(error: unknown): boolean {
  const code = typeof error === 'object' && error && 'code' in error ? String((error as { code?: unknown }).code) : '';
  return ['ENOTFOUND', 'ENODATA', 'ENODOMAIN', 'ENONAME'].includes(code);
}
