# GeoLead Security Best Practices Report

## Vulnerability Summary

The production Express/Prisma API and Next.js frontend were reviewed against OWASP Top 10, ASVS, CWE guidance, least privilege, defense in depth, and fail-secure defaults. Seventeen vulnerability classes were confirmed and remediated. The highest-risk paths were account takeover through seeded-account registration, durable browser token theft, cross-tenant object access, unsigned provider webhooks, and SSRF through user-configurable network targets.

Production dependency audits now report zero known vulnerabilities for both backend and frontend. Backend and frontend production builds pass, the Prisma schema validates, and the targeted security regression suite passes.

## Root Cause

The application evolved from a single-user deployment into a multi-tenant SaaS. Several service methods retained optional ownership parameters or global fallbacks, background reply matching and job stores did not bind results to a tenant, and browser caches assumed only one account would use a device. Authentication credentials were designed for browser persistence rather than XSS resistance, and public integration endpoints trusted caller-provided identifiers or destinations. Security controls were also duplicated across routes, causing inconsistent rate limiting, proxy handling, TLS verification, and validation.

## Affected Files

Primary remediation locations include:

- `backend/src/routes/auth.ts:55-172` and `backend/src/services/auth.ts`
- `backend/src/routes/outbound.ts:305-522` and `backend/src/services/outboundPlatform.ts:1536-2810`
- `backend/src/services/ssrfGuard.ts:23-184`
- `backend/src/services/webhookSecurity.ts:1-75`
- `backend/src/middleware/rateLimit.ts`
- `backend/src/security/tenantIsolation.ts` and `backend/src/scripts/auditTenantIsolation.ts`
- `backend/prisma/schema.prisma:96-660`
- `frontend/src/lib/outbound.ts`, `frontend/src/lib/auth.tsx`, `frontend/src/lib/domainContext.tsx`, `frontend/src/components/SupportBubble.tsx`, and `frontend/next.config.ts`

## Complete Secure Fix

### SEC-001 ? Seeded account takeover

**Severity:** Critical ? **CWE-284/CWE-287** ? **OWASP A01/A07** ? **CVSS 9.1**

A public registrant who knew the seeded administrator email could set the password of that passwordless account. The root cause was treating ?no password yet? as authorization to claim an existing identity.

Registration now rejects every existing email at `backend/src/routes/auth.ts:99-112`. Passwordless seeded users can activate only through the hashed, expiring, single-use email reset flow. Concurrent token consumption is atomic.

### SEC-002 ? Durable token theft through localStorage

**Severity:** High ? **CWE-922/CWE-79** ? **OWASP A07** ? **CVSS 8.1**

Any XSS could exfiltrate both access and refresh tokens and maintain account access for up to 30 days. Refresh credentials are now rotated in `Secure`, `HttpOnly`, scoped cookies; access tokens exist only in memory. Refresh and logout require an exact trusted origin plus a non-simple client header. JWT algorithms, issuer, audience, secret strength, and refresh replay-family revocation are enforced.

WebSockets now use a 30-second single-use ticket rather than exposing JWTs in the WebSocket protocol.

### SEC-003 ? Cross-tenant IDOR/BOLA

**Severity:** Critical ? **CWE-639/CWE-862** ? **OWASP A01** ? **CVSS 9.4**

Authenticated users could reference another tenant?s sender, reply, template, campaign lead, email log, verification job, or webhook history. Confirmed sinks included one-off sending, reply suggestion/ingestion, sender verification, campaign construction, and global email statistics.

Every confirmed route now passes a required user ID and service queries scope through direct or relational ownership. Related IDs are ownership-validated before use. Email verification jobs, statistics, webhook events, uploaded leads/tasks, domain buyers, and offers are tenant-bound. Inaccessible resources return not-found behavior.

### SEC-004 ? Unsigned and replayable webhooks

**Severity:** Critical ? **CWE-345/CWE-294** ? **OWASP A08** ? **CVSS 9.1**

Forged events could mark messages delivered/replied, suppress leads, or alter billing state. Provider webhooks now fail closed unless native Resend/Svix, Mailgun, SendGrid, Paddle, or Coinbase signatures validate against the exact raw body. Timestamp windows and constant-time comparisons are used where supported. Persistent provider event IDs prevent replay across processes and restarts.

Webhook payload storage is minimized and tenant-scoped to avoid cross-tenant event disclosure.

### SEC-005 ? SSRF and internal network access

**Severity:** High ? **CWE-918** ? **OWASP A10** ? **CVSS 8.2**

User-influenced crawler, website, SMTP, IMAP, and certificate-check targets could reach internal services or cloud metadata. The shared guard rejects unsafe schemes, credentials, ports, private/reserved IPv4 and IPv6, mixed safe/private DNS answers, and unsafe redirects. Socket lookup revalidates and pins the vetted address, closing DNS-rebinding TOCTOU paths.

SMTP and IMAP permit only expected ports, require production TLS/STARTTLS, verify certificates, and block internal targets.

### SEC-006 ? Open tracking redirect

**Severity:** High ? **CWE-601** ? **OWASP A01** ? **CVSS 7.4**

The click endpoint accepted an arbitrary HTTP(S) destination in the query string, allowing the trusted GeoLead domain to redirect to phishing pages. `resolveClickDestination` at `backend/src/services/outboundPlatform.ts:2164` now requires the destination to match a URL embedded in the original sent message (or a persisted immutable destination).

### SEC-007 ? Weak CORS, proxy, and error defaults

**Severity:** High ? **CWE-942/CWE-209** ? **OWASP A05** ? **CVSS 7.5**

When no origin was configured, CORS reflected arbitrary origins while allowing credentials. Forwarded headers were also parsed manually, and errors could expose internals.

Production now refuses to start without an exact origin allowlist, trusts only the configured proxy hop, uses `req.ip`, bounds body parsers, disables fingerprinting, and returns generic 404/500 responses. Express and Next security headers include CSP, frame denial, nosniff, referrer policy, permissions policy, and production HSTS at the Vercel edge.

### SEC-008 ? Per-process rate-limit bypass

**Severity:** High ? **CWE-307/CWE-770** ? **OWASP A04/A07** ? **CVSS 7.5**

Attackers could distribute requests across dynos/processes to bypass authentication, email, and outbound limits. Shared Redis counters now bind limits to authenticated users or trusted client IPs. Production fails closed if the protection store is unavailable; local development alone may use bounded in-memory fallback.

### SEC-009 ? Insecure secret-key derivation and silent decryption failure

**Severity:** High ? **CWE-321/CWE-311** ? **OWASP A02** ? **CVSS 7.5**

Stored provider credentials could derive encryption from the database URL or a development constant, and authentication failures returned an empty string. New ciphertext uses AES-256-GCM with a dedicated, minimum-strength `SECRET_ENCRYPTION_KEY`, explicit versioning, authenticated tags, and fail-secure errors. The database URL is never an encryption key.

Legacy ciphertext can be read only with the existing `OUTBOUND_SECRET_KEY` during migration; all newly saved values use the dedicated v2 key.

### SEC-010 ? Vulnerable spreadsheet and mail dependencies

**Severity:** High ? **CWE-1321/CWE-1333/CWE-918** ? **OWASP A06** ? **CVSS 7.8**

The project used the vulnerable npm SheetJS line and vulnerable Nodemailer, FormData, Undici, and PostCSS transitive versions. SheetJS was replaced with maintained `@e965/xlsx`; mail/parser dependencies were upgraded; secure transitive overrides were locked. Both production audits now return zero vulnerabilities.

Workbook imports are capped by file size, sheets, rows, columns, and extracted address count.

### SEC-011 ? Spreadsheet formula injection

**Severity:** High ? **CWE-1236** ? **OWASP A03** ? **CVSS 7.3**

Attacker-controlled lead fields beginning with spreadsheet formula characters could execute when an operator opened CSV/XLSX exports. Export values beginning with tab, carriage return, `=`, `+`, `-`, or `@` are neutralized before CSV/XLSX serialization at `backend/src/server.ts:629-702` and in the offline frontend export path.

### SEC-012 ? Guest support-ticket capability exposure

**Severity:** Medium ? **CWE-639** ? **OWASP A01** ? **CVSS 6.5**

Knowledge of a guest ticket UUID allowed reading or appending its conversation. Guest chat creation now returns a separate 256-bit capability; only its SHA-256 hash is stored. Poll and reply operations require both ticket ID and capability.

### SEC-013 ? Campaign event-history IDOR

**Severity:** High ? **CWE-639/CWE-862** ? **OWASP A01** ? **CVSS 8.1**

`getCampaignEvents` accepted the authenticated user ID but omitted it from the query. An authenticated attacker who obtained or guessed another campaign UUID could read recipient addresses, subjects, user agents, IP addresses, and delivery/open/click history. The shared predicate at `backend/src/security/tenantIsolation.ts:15` now requires both campaign ID and campaign owner, and `backend/src/services/outboundPlatform.ts:3673` applies it to both the result and count queries.

### SEC-014 ? Cross-tenant IMAP reply matching

**Severity:** Critical ? **CWE-639/CWE-862** ? **OWASP A01** ? **CVSS 9.1**

IMAP ingestion matched In-Reply-To IDs, tracking tokens, recipient addresses, and lead emails across the entire database. If two customers contacted the same prospect, one mailbox could attach a reply to the other tenant's campaign and mutate its lead, sequence, suppression, and domain state. `backend/src/services/inboxSync.ts:305-367` now requires the mailbox owner in every matching strategy, rejects ownerless mailboxes, and uses mailbox-scoped synchronization locks. Reply reads additionally require campaign, lead, and optional mailbox ownership to agree.

Resend's weaker sender-address fallback now fails closed when recent matching sends belong to more than one tenant; it never chooses a tenant merely because that tenant sent most recently.

### SEC-015 ? Cross-tenant background job and template state

**Severity:** High ? **CWE-639/CWE-200** ? **OWASP A01** ? **CVSS 7.7**

Acquisition-scan jobs stored no owner, so any authenticated user holding another job ID could poll its domain analysis. Job records now carry `userId`, polling returns not-found on an owner mismatch, and IDs use 256 bits of cryptographic randomness at `backend/src/routes/domains.ts:36-82`.

Default-template selection also queried the first template globally, allowing a new campaign to copy another tenant's private template. `ensureDefaultTemplate` at `backend/src/services/outboundPlatform.ts:3613` now requires a user ID and selects or creates templates only inside that tenant.

The production consistency audit found three legacy sequence-template links and historical email-log sender/template links created before this control existed. Migration `20260712050000_repair_tenant_relations` detaches only those optional cross-tenant foreign keys; copied sequence content and immutable email history remain intact.

### SEC-016 ? Shared-browser cached tenant data

**Severity:** High ? **CWE-922/CWE-200** ? **OWASP A01/A04** ? **CVSS 7.1**

The authenticated support bubble and active-domain state used device-global localStorage keys and retained in-memory state across identity changes. On a shared browser, the next account could briefly see the previous account's cached support messages or domains even though the API correctly rejected subsequent requests. Support and domain storage are now namespaced by authenticated user ID at `frontend/src/components/SupportBubble.tsx:39-139` and `frontend/src/lib/domainContext.tsx:19-106`; identity changes fail closed while the correct tenant state hydrates.

### SEC-017 ? Integration provisioning crossed global and tenant defaults

**Severity:** High ? **CWE-668/CWE-862** ? **OWASP A01/A05** ? **CVSS 7.5**

Outbound seed/provisioning counted templates and senders globally and only provisioned the seeded administrator, so one tenant's existing records influenced whether another tenant received defaults. Per-user Resend/SMTP settings were testable but were not reliably connected to a tenant-owned sender. Provisioning now scopes every existence check and created record to the authenticated user. `getUserSettingOverride` at `backend/src/services/settings.ts:121` deliberately excludes platform environment fallbacks, preventing a platform-wide API key or SMTP password from being copied into every customer's sender configuration.

Explicit per-user Resend and SMTP settings now create only that user's encrypted sender account; list responses remain redacted and never return provider credentials.

## Explanation

The changes preserve GeoLead?s web-only UX: login still yields an immediately usable session, reloads silently refresh through the cookie, WebSocket events reconnect through a short-lived ticket, email tracking and unsubscribe links remain public, campaign sending retains all providers, and CSV/XLSX workflows remain available. Security-sensitive interfaces changed only where retaining the old behavior would preserve the vulnerability.

The installed security skill drove the use of evidence-based findings, complete root-cause remediation, strict tenant boundaries, exact-origin controls, safe outbound networking, and production dependency verification.

## Additional Hardening

- Configure unique production values for `JWT_SECRET`, `OUTBOUND_SECRET_KEY`, and `SECRET_ENCRYPTION_KEY`.
- Configure only webhook providers actually in use; unconfigured webhook endpoints intentionally return 401.
- Keep Redis healthy because production abuse controls fail closed.
- Add provider-specific integration tests with captured signed sandbox fixtures as those provider accounts become available.
- Move the current static Next.js CSP to nonce-based rendering in a future rendering architecture change; the present policy still requires `unsafe-inline` for Next?s static bootstrap but blocks remote scripts, plugins, framing, and unsafe object/base behavior.

## Verification

- Backend TypeScript build: passed.
- Next.js production build and type checking: passed.
- Prisma schema validation: passed.
- Security regression tests: 3 passed (SSRF ranges, password bounds, signed/tampered Resend webhook).
- Backend `npm audit --omit=dev`: 0 vulnerabilities.
- Frontend `npm audit --omit=dev`: 0 vulnerabilities.
- Final scans found no browser authentication tokens in Web Storage, body-based refresh flow, JWT WebSocket subprotocol, permissive CORS fallback, database-derived encryption key, or production TLS-disable switch.

## Remaining Risks

- Full frontend ESLint is not clean because the existing application has 77 errors and 29 warnings outside this security change; the production build and TypeScript checks pass.
- Deployment requires production secrets to be populated before the SSH workflow rebuilds the fail-closed backend. The migration is committed and will run automatically through `prisma migrate deploy`.
- The certificate-intelligence probe deliberately connects with Node certificate rejection disabled so it can measure invalid/self-signed certificates; it sends no credentials or application data and is protected by the SSRF network-target guard.
