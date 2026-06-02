import { resolve4, resolve6, resolveMx, resolveTxt } from 'node:dns/promises';
import {
  DISPOSABLE_DOMAINS,
  DISPOSABLE_PATTERNS,
  FREE_EMAIL_PROVIDERS,
  MX_PROVIDERS,
  MX_PROVIDER_PATTERNS,
  ROLE_ACCOUNT_PREFIXES,
  type MxProviderInfo,
} from './emailVerificationData.js';

export type VerificationStatus = 'VALID' | 'RISKY' | 'INVALID';
export type RiskLevel = 'low' | 'medium' | 'high';
export type CatchAllRisk = 'low' | 'medium' | 'high' | 'unknown';

export interface EmailVerificationResult {
  email: string;
  status: VerificationStatus;
  confidenceScore: number; // 0-100
  provider: string | null;
  mxHost: string | null;
  mxValid: boolean;
  disposable: boolean;
  roleAccount: boolean;
  freeProvider: boolean;
  catchAllRisk: CatchAllRisk;
  riskLevel: RiskLevel;
  reputationScore: number; // 0-100
  recommendation: string;
  verificationMetadata: {
    syntaxValid: boolean;
    domainValid: boolean;
    mxRecords: string[];
    hasSPF: boolean;
    hasDMARC: boolean;
    hasWebsite: boolean;
    durationMs: number;
    verifiedAt: string;
  };
}

const DNS_TIMEOUT_MS = 3000;
const PLACEHOLDER_DOMAINS = new Set(['example.com', 'example.org', 'example.net', 'test.com', 'localhost', 'invalid', 'domain.com']);
const RESERVED_TLDS = ['.test', '.invalid', '.localhost', '.example', '.local'];

// 24h cache for DNS lookups — long enough to avoid re-resolving the same domain across
// a batch, short enough that MX/SPF/DMARC changes are picked up within a day.
const DNS_CACHE_TTL_MS = 24 * 60 * 60 * 1000;

interface CacheEntry<T> { promise: Promise<T>; createdAt: number }
const domainCache = new Map<string, CacheEntry<DomainCheck>>();
const mxCache = new Map<string, CacheEntry<MxCheck>>();
const txtCache = new Map<string, CacheEntry<string[]>>();

function getCached<T>(cache: Map<string, CacheEntry<T>>, key: string): Promise<T> | null {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.createdAt > DNS_CACHE_TTL_MS) {
    cache.delete(key);
    return null;
  }
  return entry.promise;
}

function putCached<T>(cache: Map<string, CacheEntry<T>>, key: string, promise: Promise<T>): Promise<T> {
  cache.set(key, { promise, createdAt: Date.now() });
  return promise;
}

interface DomainCheck { valid: boolean; reason: string; hasWebsite: boolean }
interface MxCheck { valid: boolean; primary: string | null; records: string[]; priority: number }

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('DNS_TIMEOUT')), ms);
    promise.then(
      (v) => { clearTimeout(timer); resolve(v); },
      (e) => { clearTimeout(timer); reject(e); }
    );
  });
}

function isDnsMiss(err: any): boolean {
  if (!err) return false;
  const code = err.code || '';
  return ['ENOTFOUND', 'ENODATA', 'ENONAME', 'NXDOMAIN'].includes(code);
}

export function normalizeEmail(input: string): string {
  return String(input || '').trim().toLowerCase();
}

export async function verifyEmail(rawEmail: string): Promise<EmailVerificationResult> {
  const start = Date.now();
  const email = normalizeEmail(rawEmail);

  const result: EmailVerificationResult = {
    email,
    status: 'INVALID',
    confidenceScore: 0,
    provider: null,
    mxHost: null,
    mxValid: false,
    disposable: false,
    roleAccount: false,
    freeProvider: false,
    catchAllRisk: 'unknown',
    riskLevel: 'high',
    reputationScore: 0,
    recommendation: '',
    verificationMetadata: {
      syntaxValid: false, domainValid: false, mxRecords: [],
      hasSPF: false, hasDMARC: false, hasWebsite: false,
      durationMs: 0, verifiedAt: new Date().toISOString(),
    },
  };

  // Step 1: Syntax
  const syntax = validateSyntax(email);
  if (!syntax.valid) {
    result.recommendation = syntax.reason;
    result.verificationMetadata.durationMs = Date.now() - start;
    return result;
  }
  result.verificationMetadata.syntaxValid = true;
  const [localPart, domain] = email.split('@');

  // Step 2: Domain
  const domainCheck = await validateDomain(domain);
  if (!domainCheck.valid) {
    result.recommendation = domainCheck.reason;
    result.verificationMetadata.durationMs = Date.now() - start;
    return result;
  }
  result.verificationMetadata.domainValid = true;
  result.verificationMetadata.hasWebsite = domainCheck.hasWebsite;

  // Step 3: MX
  const mx = await validateMx(domain);
  result.mxValid = mx.valid;
  result.mxHost = mx.primary;
  result.verificationMetadata.mxRecords = mx.records;
  if (!mx.valid) {
    result.recommendation = 'Domain has no valid mail server (MX/A) configuration';
    result.verificationMetadata.durationMs = Date.now() - start;
    return result;
  }

  // Step 4: Disposable
  result.disposable = isDisposable(domain);
  if (result.disposable) {
    result.confidenceScore = 8;
    result.riskLevel = 'high';
    result.recommendation = 'Disposable / temporary email — exclude from outreach';
    result.verificationMetadata.durationMs = Date.now() - start;
    return result;
  }

  // Step 5: Role
  result.roleAccount = isRoleAccount(localPart);

  // Step 6: Free
  result.freeProvider = FREE_EMAIL_PROVIDERS.has(domain);

  // Step 7: Provider + catch-all
  const providerInfo = detectProvider(mx.records);
  result.provider = providerInfo.name;
  result.catchAllRisk = providerInfo.catchAllLikelihood as CatchAllRisk;

  // Step 8: Reputation
  const [spfRecords, dmarcRecords] = await Promise.all([
    readTxt(domain),
    readTxt(`_dmarc.${domain}`),
  ]);
  const hasSPF = spfRecords.some((r) => /^v=spf1\b/i.test(r));
  const hasDMARC = dmarcRecords.some((r) => /^v=dmarc1\b/i.test(r));
  result.verificationMetadata.hasSPF = hasSPF;
  result.verificationMetadata.hasDMARC = hasDMARC;

  result.reputationScore = computeReputation({
    mxRecords: mx.records, providerInfo, hasWebsite: domainCheck.hasWebsite,
    hasSPF, hasDMARC, roleAccount: result.roleAccount, freeProvider: result.freeProvider,
  });

  const final = finalize(result);
  result.confidenceScore = final.confidenceScore;
  result.status = final.status;
  result.riskLevel = final.riskLevel;
  result.recommendation = final.recommendation;
  result.verificationMetadata.durationMs = Date.now() - start;
  return result;
}

function validateSyntax(email: string): { valid: boolean; reason: string } {
  if (!email) return { valid: false, reason: 'Email is empty' };
  if (email.length > 254) return { valid: false, reason: 'Email exceeds RFC 5321 length (254)' };

  const at = email.indexOf('@');
  if (at < 1 || at !== email.lastIndexOf('@')) {
    return { valid: false, reason: 'Email must contain exactly one @' };
  }
  const local = email.slice(0, at);
  const domain = email.slice(at + 1);
  if (local.length > 64) return { valid: false, reason: 'Local part exceeds 64 chars' };
  if (!domain || domain.length < 3) return { valid: false, reason: 'Domain too short' };
  if (/\.\./.test(email)) return { valid: false, reason: 'Email contains consecutive dots' };
  if (local.startsWith('.') || local.endsWith('.')) {
    return { valid: false, reason: 'Local part cannot start or end with a dot' };
  }
  const re = /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)*$/i;
  if (!re.test(email)) return { valid: false, reason: 'Email does not match RFC 5322 syntax' };
  const tld = domain.split('.').pop() || '';
  if (tld.length < 2 || /^\d+$/.test(tld)) return { valid: false, reason: 'Invalid TLD' };
  return { valid: true, reason: '' };
}

async function validateDomain(domain: string): Promise<DomainCheck> {
  const key = domain.toLowerCase();
  if (PLACEHOLDER_DOMAINS.has(key)) return { valid: false, reason: 'Placeholder/test domain', hasWebsite: false };
  if (RESERVED_TLDS.some((t) => key.endsWith(t))) return { valid: false, reason: 'Reserved TLD', hasWebsite: false };

  const cached = getCached(domainCache, key);
  if (cached) return cached;
  return putCached(domainCache, key, performDomainCheck(key));
}

async function performDomainCheck(domain: string): Promise<DomainCheck> {
  try {
    const [v4, v6] = await Promise.allSettled([
      withTimeout(resolve4(domain), DNS_TIMEOUT_MS),
      withTimeout(resolve6(domain), DNS_TIMEOUT_MS),
    ]);
    const ok4 = v4.status === 'fulfilled' && v4.value.length > 0;
    const ok6 = v6.status === 'fulfilled' && v6.value.length > 0;
    if (ok4 || ok6) return { valid: true, reason: '', hasWebsite: true };
    const definite =
      v4.status === 'rejected' && isDnsMiss((v4 as any).reason) &&
      v6.status === 'rejected' && isDnsMiss((v6 as any).reason);
    if (definite) return { valid: false, reason: 'Domain does not exist (NXDOMAIN)', hasWebsite: false };
    return { valid: true, reason: '', hasWebsite: false };
  } catch {
    return { valid: true, reason: '', hasWebsite: false };
  }
}

async function validateMx(domain: string): Promise<MxCheck> {
  const key = domain.toLowerCase();
  const cached = getCached(mxCache, key);
  if (cached) return cached;
  return putCached(mxCache, key, performMxCheck(key));
}

async function performMxCheck(domain: string): Promise<MxCheck> {
  try {
    const records = await withTimeout(resolveMx(domain), DNS_TIMEOUT_MS);
    if (!records || records.length === 0) {
      // Implicit MX fallback (RFC 5321) - if A record exists, the domain itself is the MX
      try {
        const a = await withTimeout(resolve4(domain), DNS_TIMEOUT_MS);
        if (a && a.length > 0) {
          return { valid: true, primary: domain, records: [domain], priority: 0 };
        }
      } catch { /* ignore */ }
      return { valid: false, primary: null, records: [], priority: 0 };
    }
    const sorted = [...records].sort((a, b) => a.priority - b.priority);
    const primary = sorted[0].exchange.toLowerCase().replace(/\.$/, '');
    return {
      valid: true,
      primary,
      records: sorted.map((r) => r.exchange.toLowerCase().replace(/\.$/, '')),
      priority: sorted[0].priority,
    };
  } catch (err) {
    if (isDnsMiss(err)) return { valid: false, primary: null, records: [], priority: 0 };
    return { valid: false, primary: null, records: [], priority: 0 };
  }
}

async function readTxt(name: string): Promise<string[]> {
  const key = name.toLowerCase();
  const cached = getCached(txtCache, key);
  if (cached) return cached;
  const promise = (async () => {
    try {
      const records = await withTimeout(resolveTxt(name), DNS_TIMEOUT_MS);
      return records.map((r) => r.join('')).filter(Boolean);
    } catch {
      return [] as string[];
    }
  })();
  return putCached(txtCache, key, promise);
}

function isDisposable(domain: string): boolean {
  const d = domain.toLowerCase();
  if (DISPOSABLE_DOMAINS.has(d)) return true;
  for (const p of DISPOSABLE_PATTERNS) {
    if (p.test(d)) return true;
  }
  return false;
}

function isRoleAccount(localPart: string): boolean {
  const norm = localPart.toLowerCase().replace(/[._-]/g, '');
  if (ROLE_ACCOUNT_PREFIXES.has(norm)) return true;
  for (const prefix of ROLE_ACCOUNT_PREFIXES) {
    if (norm.startsWith(prefix) && norm.length <= prefix.length + 3) return true;
  }
  return false;
}

function detectProvider(mxRecords: string[]): MxProviderInfo {
  if (!mxRecords || mxRecords.length === 0) {
    return { name: 'unknown', type: 'custom', catchAllLikelihood: 'unknown' as any, reputationBonus: 0 };
  }
  const primary = mxRecords[0].toLowerCase();
  for (const [host, info] of Object.entries(MX_PROVIDERS)) {
    if (primary.includes(host)) return info;
  }
  for (const { pattern, info } of MX_PROVIDER_PATTERNS) {
    if (pattern.test(primary)) return info;
  }
  // Heuristic catch-all risk for unknown providers
  let catchAll: 'low' | 'medium' | 'high' = 'medium';
  if (mxRecords.length >= 2) catchAll = 'low';
  if (/cpanel|plesk|server\d+|mail\d+|shared/i.test(primary)) catchAll = 'high';
  return { name: 'custom', type: 'custom', catchAllLikelihood: catchAll, reputationBonus: 0 };
}

interface ReputationContext {
  mxRecords: string[]; providerInfo: MxProviderInfo; hasWebsite: boolean;
  hasSPF: boolean; hasDMARC: boolean; roleAccount: boolean; freeProvider: boolean;
}

function computeReputation(ctx: ReputationContext): number {
  let score = 50;
  score += ctx.providerInfo.reputationBonus;
  if (ctx.mxRecords.length >= 2) score += 10;
  else if (ctx.mxRecords.length === 1) score += 5;
  if (ctx.hasWebsite) score += 10;
  if (ctx.hasSPF) score += 8;
  if (ctx.hasDMARC) score += 7;
  if (ctx.roleAccount) score -= 12;
  if (ctx.freeProvider) score -= 8;
  if (ctx.providerInfo.catchAllLikelihood === 'high') score -= 15;
  else if (ctx.providerInfo.catchAllLikelihood === 'medium') score -= 5;
  return Math.max(0, Math.min(100, score));
}

interface FinalDecision {
  status: VerificationStatus;
  confidenceScore: number;
  riskLevel: RiskLevel;
  recommendation: string;
}

function finalize(r: EmailVerificationResult): FinalDecision {
  const score = r.reputationScore;
  let status: VerificationStatus;
  let riskLevel: RiskLevel;
  let recommendation: string;

  if (score >= 75) {
    status = 'VALID';
    riskLevel = 'low';
    recommendation = score >= 90 ? 'Excellent — safe to send' : 'Good — safe to send';
  } else if (score >= 60) {
    status = 'RISKY';
    riskLevel = 'medium';
    recommendation = 'Medium confidence — consider warmup or limit volume';
  } else {
    status = score >= 40 ? 'RISKY' : 'INVALID';
    riskLevel = 'high';
    recommendation = score >= 40
      ? 'Low confidence — verify deliverability before sending'
      : 'Poor — exclude from campaigns';
  }

  if (r.catchAllRisk === 'high' && status === 'VALID') {
    status = 'RISKY';
    riskLevel = 'medium';
    recommendation = 'Catch-all domain — bounce risk elevated';
  }

  return { status, confidenceScore: score, riskLevel, recommendation };
}

export async function verifyEmailsBulk(
  emails: string[],
  concurrency = 10,
  onProgress?: (done: number, total: number) => void
): Promise<EmailVerificationResult[]> {
  const results: EmailVerificationResult[] = new Array(emails.length);
  let cursor = 0;
  let done = 0;

  async function worker() {
    while (cursor < emails.length) {
      const idx = cursor++;
      try {
        results[idx] = await verifyEmail(emails[idx]);
      } catch (err: any) {
        results[idx] = {
          email: emails[idx], status: 'INVALID', confidenceScore: 0,
          provider: null, mxHost: null, mxValid: false, disposable: false,
          roleAccount: false, freeProvider: false, catchAllRisk: 'unknown',
          riskLevel: 'high', reputationScore: 0,
          recommendation: `Verification error: ${err?.message || 'unknown'}`,
          verificationMetadata: {
            syntaxValid: false, domainValid: false, mxRecords: [],
            hasSPF: false, hasDMARC: false, hasWebsite: false,
            durationMs: 0, verifiedAt: new Date().toISOString(),
          },
        };
      }
      done++;
      if (onProgress) onProgress(done, emails.length);
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, emails.length) }, () => worker());
  await Promise.all(workers);
  return results;
}

export function getKnownProviders(): Array<{ host: string; info: MxProviderInfo }> {
  return Object.entries(MX_PROVIDERS).map(([host, info]) => ({ host, info }));
}
