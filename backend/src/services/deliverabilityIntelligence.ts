import net from 'node:net';
import tls from 'node:tls';
import { assertSafeNetworkTarget } from './ssrfGuard.js';
import { resolveMx } from 'node:dns/promises';

const SMTP_TIMEOUT_MS = 6000;
const RDAP_TIMEOUT_MS = 4000;
const SSL_TIMEOUT_MS = 4000;

const smtpProbeCache = new Map<string, Promise<SmtpProbeResult>>();
const catchAllCache = new Map<string, Promise<boolean>>();
const domainAgeCache = new Map<string, Promise<DomainAgeResult>>();
const sslCache = new Map<string, Promise<SslCheckResult>>();

export interface SmtpProbeResult {
  rcptAccepted: boolean;
  reachable: boolean;
  greylisted: boolean;
  rejectionCode?: number;
  rejectionReason?: string;
  responseTimeMs: number;
}

export interface DomainAgeResult {
  registeredAt: string | null;
  ageDays: number | null;
  source: 'rdap' | 'unknown';
}

export interface SslCheckResult {
  valid: boolean;
  issuer: string | null;
  daysToExpiry: number | null;
  selfSigned: boolean;
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timeout')), ms);
    promise.then((v) => { clearTimeout(timer); resolve(v); }).catch((err) => { clearTimeout(timer); reject(err); });
  });
}

// ---------- SMTP PROBE ----------

export async function smtpProbe(email: string): Promise<SmtpProbeResult> {
  const key = email.toLowerCase();
  const cached = smtpProbeCache.get(key);
  if (cached) return cached;
  const promise = performSmtpProbe(key);
  smtpProbeCache.set(key, promise);
  return promise;
}

async function performSmtpProbe(email: string): Promise<SmtpProbeResult> {
  const start = Date.now();
  const empty: SmtpProbeResult = { rcptAccepted: false, reachable: false, greylisted: false, responseTimeMs: 0 };

  const domain = email.split('@')[1];
  if (!domain) return empty;

  let mxHost: string | null = null;
  try {
    const records = await withTimeout(resolveMx(domain), 3000);
    if (records.length === 0) return empty;
    records.sort((a, b) => a.priority - b.priority);
    mxHost = records[0].exchange;
  } catch {
    return empty;
  }

  return new Promise<SmtpProbeResult>((resolve) => {
    const socket = net.createConnection({ host: mxHost!, port: 25 });
    socket.setTimeout(SMTP_TIMEOUT_MS);
    let stage: 'greet' | 'helo' | 'mail' | 'rcpt' | 'quit' = 'greet';
    let buffer = '';
    let result: SmtpProbeResult = { rcptAccepted: false, reachable: false, greylisted: false, responseTimeMs: 0 };

    const cleanup = () => {
      result.responseTimeMs = Date.now() - start;
      try { socket.destroy(); } catch { /* ignore */ }
      resolve(result);
    };

    socket.on('error', cleanup);
    socket.on('timeout', cleanup);
    socket.on('close', cleanup);

    socket.on('data', (chunk) => {
      buffer += chunk.toString();
      if (!buffer.includes('\r\n')) return;
      const lines = buffer.split('\r\n').filter(Boolean);
      const lastComplete = lines[lines.length - 1];
      const codeMatch = lastComplete.match(/^(\d{3})\s/);
      if (!codeMatch) return;
      buffer = '';
      const code = parseInt(codeMatch[1], 10);

      if (stage === 'greet' && code === 220) {
        result.reachable = true;
        stage = 'helo';
        socket.write('EHLO geoleadai.local\r\n');
      } else if (stage === 'helo' && (code === 250 || code === 200)) {
        stage = 'mail';
        socket.write('MAIL FROM:<verify@geoleadai.local>\r\n');
      } else if (stage === 'mail' && code === 250) {
        stage = 'rcpt';
        socket.write(`RCPT TO:<${email}>\r\n`);
      } else if (stage === 'rcpt') {
        if (code >= 200 && code < 300) {
          result.rcptAccepted = true;
        } else if (code === 450 || code === 451 || code === 452) {
          result.greylisted = true;
        } else {
          result.rejectionCode = code;
          result.rejectionReason = lastComplete.slice(4).trim().slice(0, 200);
        }
        stage = 'quit';
        socket.write('QUIT\r\n');
        setTimeout(cleanup, 200);
      }
    });
  });
}

// ---------- CATCH-ALL DETECTION ----------

export async function detectCatchAll(domain: string): Promise<boolean> {
  const key = domain.toLowerCase();
  const cached = catchAllCache.get(key);
  if (cached) return cached;
  const promise = performCatchAllProbe(key);
  catchAllCache.set(key, promise);
  return promise;
}

async function performCatchAllProbe(domain: string): Promise<boolean> {
  // Pick a random local-part very unlikely to exist
  const randomLocal = `noreply-${Math.random().toString(36).slice(2, 10)}-test`;
  const result = await smtpProbe(`${randomLocal}@${domain}`);
  return result.rcptAccepted;
}

// ---------- DOMAIN AGE via RDAP ----------

export async function getDomainAge(domain: string): Promise<DomainAgeResult> {
  const key = domain.toLowerCase();
  const cached = domainAgeCache.get(key);
  if (cached) return cached;
  const promise = performRdapLookup(key);
  domainAgeCache.set(key, promise);
  return promise;
}

async function performRdapLookup(domain: string): Promise<DomainAgeResult> {
  const empty: DomainAgeResult = { registeredAt: null, ageDays: null, source: 'unknown' };
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), RDAP_TIMEOUT_MS);
    const res = await fetch(`https://rdap.org/domain/${encodeURIComponent(domain)}`, {
      signal: controller.signal,
      headers: { Accept: 'application/rdap+json' },
    });
    clearTimeout(timer);
    if (!res.ok) return empty;
    const json: any = await res.json();
    const events: any[] = json.events || [];
    const reg = events.find((e) => e.eventAction === 'registration');
    if (!reg?.eventDate) return empty;
    const registeredAt = reg.eventDate;
    const ageDays = Math.floor((Date.now() - new Date(registeredAt).getTime()) / 86400000);
    return { registeredAt, ageDays, source: 'rdap' };
  } catch {
    return empty;
  }
}

// ---------- SSL INSPECTION ----------

export async function inspectSsl(domain: string): Promise<SslCheckResult> {
  const key = domain.toLowerCase();
  const cached = sslCache.get(key);
  if (cached) return cached;
  const promise = performSslCheck(key);
  sslCache.set(key, promise);
  return promise;
}

async function performSslCheck(domain: string): Promise<SslCheckResult> {
  const empty: SslCheckResult = { valid: false, issuer: null, daysToExpiry: null, selfSigned: false };
  try { await assertSafeNetworkTarget(domain, 443, [443]); } catch { return empty; }
  return new Promise<SslCheckResult>((resolve) => {
    let resolved = false;
    const settle = (v: SslCheckResult) => { if (!resolved) { resolved = true; resolve(v); } };

    const socket = tls.connect({
      host: domain,
      port: 443,
      servername: domain,
      rejectUnauthorized: false,
      timeout: SSL_TIMEOUT_MS,
    });

    socket.setTimeout(SSL_TIMEOUT_MS);

    socket.on('secureConnect', () => {
      try {
        const cert = socket.getPeerCertificate();
        if (!cert || Object.keys(cert).length === 0) {
          socket.destroy();
          return settle(empty);
        }
        const expires = new Date(cert.valid_to);
        const daysToExpiry = Math.floor((expires.getTime() - Date.now()) / 86400000);
        const rawIssuer = cert.issuer?.O || cert.issuer?.CN || null;
        const issuer = Array.isArray(rawIssuer) ? (rawIssuer[0] || null) : rawIssuer;
        const selfSigned = !!cert.issuer && !!cert.subject && JSON.stringify(cert.issuer) === JSON.stringify(cert.subject);
        socket.destroy();
        settle({
          valid: socket.authorized,
          issuer,
          daysToExpiry,
          selfSigned,
        });
      } catch {
        socket.destroy();
        settle(empty);
      }
    });

    socket.on('error', () => settle(empty));
    socket.on('timeout', () => { socket.destroy(); settle(empty); });
  });
}
