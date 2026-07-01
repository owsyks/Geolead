# GeoLead AI — Release-Readiness Prompt ("What's left to fully launch")

**Role:** You are a senior full-stack engineer taking GeoLead AI from a working
single-user tool to a **multi-tenant SaaS that can be sold to untrusted strangers**.
The core engine (search → crawl → enrich → verify emails → outbound campaigns) is
built and verified end-to-end. A real auth + multi-tenancy layer exists, and
**paid plan tiers + purchasing (Paddle for cards, Coinbase Commerce for crypto) +
hard quota enforcement are now implemented** (see §DONE). Your job is to close the
remaining verified gaps below.

**Stack:** Next.js (frontend, Vercel) · Express + Prisma/PostgreSQL + BullMQ/Redis
(backend, Heroku) · Python crawler (Azure VM) · Resend/SendGrid/SES/SMTP sending ·
Paddle Billing (cards) + Coinbase Commerce (crypto).

**Ground rules:**
- Don't regress the verified send/webhook/SMTP paths (see `AUDIT_REPORT.md`) or the billing gates (§DONE).
- Every data-touching route must be tenant-scoped (`userId`/`ownerId`) and `requireAuth`.
- Ship each gate fail-closed. Add a test for every gate.

---

## DONE — Billing, plans & enforcement (this pass)

Free-trial / Starter / Pro tiers, dual-rail purchasing (Paddle cards + Coinbase
crypto), and fail-closed quota enforcement are implemented and typecheck clean
(backend + frontend). Key files:

- Plan matrix: [backend/src/config/plans.ts](backend/src/config/plans.ts) — Trial (7-day, no card) / Starter $49 / Pro $149, with per-tier searches/mo, max depth, lead cap, sends/day, sender cap.
- Entitlements + usage + assertions: [backend/src/services/billing.ts](backend/src/services/billing.ts) — usage derived from `SearchTask`/`Lead`/`EmailLog`/`SenderAccount` (no counter drift); `assertCanSpend`/`assertQuota` throw typed 402 errors; fail-closed when trial expired.
- Middleware: `requireVerifiedEmail` + `requirePlanCapacity(metric)` in [backend/src/middleware/auth.ts](backend/src/middleware/auth.ts).
- Enforcement wired at: `POST /api/search` (+ depth clamp) [server.ts](backend/src/server.ts); sender create, campaign queue/force-send, send-now, AI generate/rewrite [routes/outbound.ts](backend/src/routes/outbound.ts); per-owner daily send cap in the send tick [outboundPlatform.ts](backend/src/services/outboundPlatform.ts); lead-cap during persistence [taskProcessor.ts](backend/src/services/taskProcessor.ts).
- Payments: [backend/src/services/paddle.ts](backend/src/services/paddle.ts) (cards, recurring) + [backend/src/services/coinbase.ts](backend/src/services/coinbase.ts) (crypto, one-time = `CRYPTO_ACCESS_DAYS`, default 30) + [backend/src/routes/billing.ts](backend/src/routes/billing.ts) (Paddle hosted checkout, Coinbase charge, two signature-verified webhooks, cancel). Raw body captured in [server.ts](backend/src/server.ts) for HMAC verification.
- Trial set at registration [routes/auth.ts](backend/src/routes/auth.ts); schema + migration `20260701120000_billing_plans_subscriptions` (generic `Subscription` w/ `provider` = paddle|coinbase).
- Crypto expiry: an `active` plan whose `currentPeriodEnd` has passed collapses to `expired` in [services/billing.ts](backend/src/services/billing.ts) (fail-closed) — one-time crypto grants lapse cleanly.
- Frontend: functional pricing page (Pay by card / Pay with crypto), `/billing` dashboard with usage meters + cancel, 402 upgrade modal [UpgradeModal.tsx](frontend/src/components/UpgradeModal.tsx), trial/expired banner in [OutboundShell.tsx](frontend/src/components/OutboundShell.tsx).

**Operator steps before it works live:**
1. Paddle: create a Product + recurring Starter/Pro **prices**, set `PADDLE_*` env, configure a default payment link (Checkout settings) so hosted checkout URLs populate, and register a webhook → `/api/billing/webhook/paddle` (subscribe/transaction/subscription events). Set the Paddle checkout success URL to `/billing`.
2. Coinbase Commerce: create an API key + webhook (shared secret), set `COINBASE_COMMERCE_*` env; webhook → `/api/billing/webhook/coinbase` (`charge:confirmed`/`charge:resolved`).
3. `npx prisma migrate deploy`.
4. **Rotate the Paddle API key that was shared in chat.**

**Still owed on billing (follow-ups):** invoices/receipts UI, proration on mid-cycle
switch, tax (Paddle is a merchant-of-record so it handles VAT/sales tax for cards;
crypto via Coinbase is **not** — you handle tax there), dunning emails on `past_due`,
crypto renewal reminders before lapse, and a sandbox→live cutover checklist. Multi-seat
is out of scope (needs a Workspace/Membership model — see §5).

---

## 1. Email-verification is enforced now — finish the UX (P1)

Backend `requireVerifiedEmail` blocks cost-bearing actions (403 `EMAIL_UNVERIFIED`).
Remaining: a frontend interceptor on `EMAIL_UNVERIFIED` that shows a "Verify your
email" blocker with the existing **Resend** button ([routes/auth.ts resend-verification](backend/src/routes/auth.ts)),
and confirm the read-only dashboard still renders for an unverified user.

## 2. Tenant isolation — prove it, and fix the leaks I found (P0)

Scoping was added route-by-route; verified holes remain:
- **Global cross-tenant maintenance:** `cleanupStoredContacts()` deletes/updates `leadEmail` and `searchTask` rows with **no tenant filter** ([server.ts:688-756](backend/src/server.ts#L688)) and is reachable via `POST /api/search/cleanup` behind only `requireAuth` — any tenant's call mutates **everyone's** data. Scope it per-user or make it admin-only + offline.
- **Do a full audit:** every Prisma query reachable from an HTTP handler must filter by the authenticated `userId`/`ownerId`, including `:id` lookups.
- **Deliverable:** a cross-tenant test — user A vs user B attempts read/patch/delete of every resource by id → expect 404/403. This test is the proof.

## 3. Roles are cosmetic — implement real RBAC or drop it (P1)

Every registrant is created `role: 'ADMIN'` ([routes/auth.ts register](backend/src/routes/auth.ts)) and `getRole()` hardcodes `ADMIN` ([routes/outbound.ts:610](backend/src/routes/outbound.ts#L610)), so `requireRoles(...)` is a no-op. Either implement real roles or remove the illusion so it isn't mistaken for a control.

## 4. Webhook signatures — provider events are spoofable (P0)

Billing webhooks (Paddle, Coinbase) are now signature-verified. But **provider (Resend/SendGrid/SES)
webhooks are not** — the code notes svix verification is still a TODO
([routes/outbound.ts:485](backend/src/routes/outbound.ts#L485)). Anyone who can POST to the
inbound/provider webhook can forge bounce/delivery/open events, corrupting analytics
and marking good emails INVALID. Verify signatures for every provider; reject unsigned.

## 5. Frontend session security — tokens in localStorage (P1)

Access **and** refresh tokens plus the user object live in `localStorage`
([frontend/src/lib/outbound.ts:8-28](frontend/src/lib/outbound.ts#L8), [frontend/src/lib/auth.tsx](frontend/src/lib/auth.tsx)),
so any XSS exfiltrates a full, refreshable session. Move refresh tokens to an
httpOnly, Secure, SameSite cookie; keep only the short-lived access token in memory.
Tighten CSP alongside (§7).

## 6. Compliance & legal (P0 — cold email is regulated)

- CAN-SPAM/GDPR: every send needs a working unsubscribe + physical address — confirm mandatory pre-send (plumbing exists in [outboundPlatform.ts](backend/src/services/outboundPlatform.ts)).
- ToS/Privacy/DPA pages + accept-at-signup (`acceptedTosAt`).
- Account deletion + data export (`DELETE /api/me` hard-delete/anonymize; export endpoint). Schema cascades are in place for User-owned rows.

## 7. Production config + security hardening (P1)

- Required-env validator at boot: `JWT_SECRET`, `DATABASE_URL`, `FRONTEND_URL`, `OUTBOUND_BASE_URL` (public, not localhost — else tracking pixels/clicks break), Redis 5.0+, and `PAYPAL_*` if billing is on. Refuse to boot if missing in prod.
- Encrypt sender provider API keys / SMTP passwords at rest.
- Input validation (zod) on every route; SSRF guard on the crawler's user-influenced fetches; confirm CORS is non-wildcard; review Helmet CSP; scrub tokens/keys from logs.
- Run `/security-review` on the branch and resolve findings.

## 8. Observability & ops (P1)

Sentry (front + back); extend `/api/health` to check DB/Redis/crawler; metrics on send/bounce/queue-depth/task-failure (`failedBusinesses` already tracked); DB backups + tested restore; alerting on billing webhook failures + queue stalls.

## 9. Testing & QA gate (P1 — no tests today)

Auth-flow tests; **cross-tenant isolation suite** (§2); **billing/quota tests** (402 on trial-expired, over-search-cap, 3rd sender, over daily-send-cap; Paddle sandbox checkout→webhook→active; Coinbase charge→confirmed→active; forged-webhook rejection); deliverability guard (unverified sender blocked); smoke E2E (signup → verify → search → verify emails → campaign → dry-run send).

---

## Launch checklist (definition of "fully released")

- [x] Plans + card (Paddle) & crypto (Coinbase) purchase + fail-closed quota enforcement (§DONE)
- [x] Unverified users can't spend/send (backend gate; §1 finishes the UX)
- [ ] Cross-tenant isolation test passes for every resource; cleanup endpoint scoped (§2)
- [ ] Real RBAC or roles removed (§3)
- [ ] Provider webhooks signature-verified (§4)
- [ ] Refresh token off localStorage → httpOnly cookie (§5)
- [ ] Unsub+address mandatory; ToS/Privacy live; account deletion/export (§6)
- [ ] Prod env validated at boot; secrets encrypted; security review done (§7)
- [ ] Sentry + backups + extended health check (§8)
- [ ] Auth + isolation + billing + deliverability test suites green (§9)

**Priority order:** §2 → §4 → §6 → §5 → §1/§3 → §7 → §8/§9. Billing (§DONE) unblocks revenue; §2/§4/§6 are the "don't get sued / don't leak / don't get spoofed" trio that must land before public signup.
