// SSRF guard: validates outbound-request URLs whose host is derived from user
// input (domain analysis, website enrichment, per-user crawler base URL) before
// the server fetches them. Defense-in-depth against Server-Side Request Forgery
// (CWE-918): resolve DNS and reject any target that lands on a loopback,
// private, link-local, or otherwise reserved address — including cloud metadata
// (169.254.169.254) and internal-only services on the box.
//
// Usage:
//   await assertSafeUrl(url);                         // throws SsrfError if unsafe
//   const res = await axios.get(url, { lookup: safeLookup, maxRedirects: 0 });
//   // then follow redirects manually, re-calling assertSafeUrl on each Location.
import { lookup as dnsLookup } from 'node:dns';
import type { LookupAddress } from 'node:dns';
import axios, { type AxiosRequestConfig, type AxiosResponse } from 'axios';

export class SsrfError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SsrfError';
  }
}

const ALLOWED_PROTOCOLS = new Set(['http:', 'https:']);
const ALLOWED_PORTS = new Set(['', '80', '443']);

// Parse an IPv4 dotted-quad into its 32-bit integer, or null if not IPv4.
function ipv4ToInt(ip: string): number | null {
  const m = ip.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!m) return null;
  const parts = m.slice(1).map(Number);
  if (parts.some((p) => p > 255)) return null;
  return ((parts[0] << 24) >>> 0) + (parts[1] << 16) + (parts[2] << 8) + parts[3];
}

// True when an IPv4 address is loopback/private/link-local/reserved/multicast.
function isBlockedIpv4(ip: string): boolean {
  const n = ipv4ToInt(ip);
  if (n === null) return true; // unpar't-able → fail closed
  const inRange = (base: string, bits: number) => {
    const baseInt = ipv4ToInt(base)!;
    const mask = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0;
    return (n & mask) === (baseInt & mask);
  };
  return (
    inRange('0.0.0.0', 8) ||        // "this" network
    inRange('10.0.0.0', 8) ||       // private
    inRange('100.64.0.0', 10) ||    // CGNAT
    inRange('127.0.0.0', 8) ||      // loopback
    inRange('169.254.0.0', 16) ||   // link-local (cloud metadata)
    inRange('172.16.0.0', 12) ||    // private
    inRange('192.0.0.0', 24) ||     // IETF protocol assignments
    inRange('192.0.2.0', 24) ||     // TEST-NET-1
    inRange('192.168.0.0', 16) ||   // private
    inRange('198.18.0.0', 15) ||    // benchmarking
    inRange('198.51.100.0', 24) ||  // TEST-NET-2
    inRange('203.0.113.0', 24) ||   // TEST-NET-3
    inRange('224.0.0.0', 4) ||      // multicast
    inRange('240.0.0.0', 4)         // reserved (incl. 255.255.255.255)
  );
}

// True when an IPv6 address is loopback/unspecified/ULA/link-local, or an
// IPv4-mapped/compat address whose embedded IPv4 is blocked.
function isBlockedIpv6(ip: string): boolean {
  const addr = ip.toLowerCase().split('%')[0]; // strip zone id
  if (addr === '::1' || addr === '::') return true; // loopback / unspecified
  // IPv4-mapped (::ffff:a.b.c.d) or IPv4-compat — validate the embedded IPv4.
  const mapped = addr.match(/(?:::ffff:|::)(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/);
  if (mapped) return isBlockedIpv4(mapped[1]);
  const head = addr.split(':')[0] || '';
  if (head === 'fe80' || head.startsWith('fe8') || head.startsWith('fe9') || head.startsWith('fea') || head.startsWith('feb')) {
    return true; // link-local fe80::/10
  }
  if (head.startsWith('fc') || head.startsWith('fd')) return true; // unique-local fc00::/7
  if (head.startsWith('ff')) return true; // multicast ff00::/8
  if (addr.startsWith('2001:db8:')) return true; // documentation range
  if (addr === '100::' || addr.startsWith('100:0:0:')) return true; // discard-only 100::/64
  return false;
}

export function isBlockedAddress(ip: string, family: number): boolean {
  return family === 6 ? isBlockedIpv6(ip) : isBlockedIpv4(ip);
}

// Resolve every A/AAAA record for a hostname and confirm NONE is blocked. Using
// { all: true } prevents a DNS-rebinding style single-record bypass.
function resolveAllSafe(hostname: string): Promise<void> {
  return new Promise((resolve, reject) => {
    dnsLookup(hostname, { all: true, verbatim: true }, (err, addresses: LookupAddress[]) => {
      if (err) return reject(new SsrfError(`DNS resolution failed for "${hostname}".`));
      if (!addresses.length) return reject(new SsrfError(`No addresses for "${hostname}".`));
      for (const a of addresses) {
        if (isBlockedAddress(a.address, a.family)) {
          return reject(new SsrfError(`Blocked internal/reserved address for "${hostname}".`));
        }
      }
      resolve();
    });
  });
}

// Validate a URL is safe to fetch server-side. Throws SsrfError otherwise.
export async function assertSafeUrl(rawUrl: string): Promise<URL> {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new SsrfError('Malformed URL.');
  }
  if (!ALLOWED_PROTOCOLS.has(url.protocol)) {
    throw new SsrfError(`Disallowed protocol "${url.protocol}".`);
  }
  if (!ALLOWED_PORTS.has(url.port)) {
    throw new SsrfError(`Disallowed port "${url.port}".`);
  }
  // Reject credentials in the URL (user:pass@host) — an exfil/confusion vector.
  if (url.username || url.password) {
    throw new SsrfError('Credentials in URL are not allowed.');
  }
  const host = url.hostname.replace(/^\[|\]$/g, ''); // unwrap [ipv6]
  // If the host is already a literal IP, check it directly (no DNS).
  const asV4 = ipv4ToInt(host);
  if (asV4 !== null) {
    if (isBlockedIpv4(host)) throw new SsrfError('Blocked internal/reserved IP.');
    return url;
  }
  if (host.includes(':')) {
    if (isBlockedIpv6(host)) throw new SsrfError('Blocked internal/reserved IPv6.');
    return url;
  }
  await resolveAllSafe(host);
  return url;
}

export async function assertSafeNetworkTarget(hostname: string, port: number, allowedPorts: readonly number[]): Promise<void> {
  const host = hostname.trim().replace(/^\[|\]$/g, '');
  if (!host || host.length > 253 || !allowedPorts.includes(port)) throw new SsrfError('Disallowed network target.');
  const asV4 = ipv4ToInt(host);
  if (asV4 !== null) {
    if (isBlockedIpv4(host)) throw new SsrfError('Blocked internal/reserved IP.');
    return;
  }
  if (host.includes(':')) {
    if (isBlockedIpv6(host)) throw new SsrfError('Blocked internal/reserved IPv6.');
    return;
  }
  await resolveAllSafe(host);
}

// SSRF-safe GET: validates the URL, pins DNS to a vetted address, and follows
// redirects manually — re-validating every hop — so a public URL can't 30x into
// an internal/metadata target. Drop-in for `axios.get(url, cfg)` on any fetch
// whose host is user-influenced. Throws SsrfError if any hop is unsafe.
export async function safeAxiosGet(
  url: string,
  config: AxiosRequestConfig = {},
  maxRedirects = 3,
): Promise<AxiosResponse> {
  const callerValidate = config.validateStatus;
  let current = url;
  for (let hop = 0; hop <= maxRedirects; hop++) {
    await assertSafeUrl(current);
    const res = await axios.get(current, {
      ...config,
      lookup: safeLookup as any,
      maxRedirects: 0,
      // Always let 3xx through so we can re-validate the Location ourselves
      // instead of letting axios auto-follow it; otherwise defer to the
      // caller's status policy (default: accept < 500, matching prior behavior).
      validateStatus: (s) => (s >= 300 && s < 400) ? true : (callerValidate ? callerValidate(s) : s < 500),
    });
    if (res.status >= 300 && res.status < 400 && res.headers?.location) {
      current = new URL(res.headers.location as string, current).toString();
      continue;
    }
    return res;
  }
  throw new SsrfError('Too many redirects.');
}

// A custom axios/http `lookup` that fails the connection if DNS resolves to a
// blocked address — closes the TOCTOU gap between our pre-check and the actual
// socket connect (DNS rebinding). Pass as `{ lookup: safeLookup }`.
export function safeLookup(
  hostname: string,
  options: any,
  callback: (err: NodeJS.ErrnoException | null, address: string, family: number) => void,
): void {
  dnsLookup(hostname, { all: true, verbatim: true }, (err, addresses: LookupAddress[]) => {
    if (err) return callback(err as NodeJS.ErrnoException, '', 0);
    const blocked = addresses.some((a) => isBlockedAddress(a.address, a.family));
    const safe = addresses[0];
    if (!safe || blocked) {
      return callback(
        Object.assign(new Error('SSRF: host resolves to a blocked address'), { code: 'ESSRF' }) as NodeJS.ErrnoException,
        '',
        0,
      );
    }
    callback(null, safe.address, safe.family);
  });
}
