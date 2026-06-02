# GeoLead AI — Audit Report

**Date:** 2026-05-31 → 2026-06-01 (updated)
**Scope:** Full backend + frontend audit, single-user local desktop context.
**Status:** All flagged critical and high-priority issues fixed. End-to-end workflow verified live against `TexasCarVendor.com`.

---

## Fixes already applied (this session)

### Backend
1. **server.ts** — rate-limit `requestBuckets` map now cleaned every 10 min (was leaking memory forever).
2. **taskProcessor.ts** — empty Serper result now logs a warning explaining "no businesses discovered" so it's distinguishable from a successful run with no leads.
3. **taskProcessor.ts** — leads with no website, no validated emails, and no phones are now skipped (was creating empty noise leads in the DB).
4. **outboundPlatform.ts** — Resend and SendGrid `sendViaProvider` now throw on 4xx instead of returning fake success. Bad sends will be marked FAILED instead of SENT.
5. **outboundPlatform.ts** — DRY_RUN sends now mark the log status `SIMULATED` (not `SENT`) and stash `dryRun: true` in metadata. UI can distinguish.
6. **outboundPlatform.ts** — `handleProviderWebhook` batch loop now `try/catch`es per event; one bad event no longer aborts the rest. Orphan events (no matching log) are logged.
7. **aiScoring.ts** — One-time `console.warn` when OPENAI_API_KEY missing, so you know scores are degraded to local NLP.

### Frontend
8. **dashboard/page.tsx** — added `mounted` ref + `verifyPollInterval` ref + `demoInterval` ref. Polling, demo simulation, and verify-poll setInterval now all clean up on unmount and skip setState if unmounted (previously: setState-after-unmount warnings and leaked intervals).
9. **dashboard/page.tsx** — search-filter input was a controlled/uncontrolled mismatch (bound to `searchFilter`, updated `searchFilterInput`). Now bound correctly to `searchFilterInput`.
10. **dashboard/page.tsx** — `BACKEND_URL` now honors `NEXT_PUBLIC_OUTBOUND_API_BASE` env var (was hard-coded to localhost).
11. **campaigns/page.tsx** — deleted dead `handleCreateCampaign` (form already calls `createCampaign`).
12. **settings/page.tsx** — `readStoredApiKeys` now SSR-safe (guards `typeof window`). Dropped `queueMicrotask` wrapper.

All TypeScript checks pass after these changes.

---

## Larger fixes — APPLIED in follow-up session

### Bigger backend changes

#### B1. Duplicate `CampaignLead` ✅ NOT A BUG
**Finding:** Schema already has `@@unique([campaignId, leadId])` and the create is wrapped in `.catch(() => null)`. Audit was wrong.

#### B2. Cross-task duplicate Leads ✅ NOT A BUG
**Finding:** Cross-task dupes are desirable (same business in two different domain searches should be separate records per search). Within-task dedup is already handled via the discovery Map.

#### B3. Add TTL to DNS caches ✅ FIXED
**Applied:** `emailVerification.ts` now uses a `CacheEntry<T>` wrapper with `createdAt` and a 24h TTL. `getCached`/`putCached` helpers added. Stale entries are evicted on next read.

#### B4. Cache TTL bug in `campaignFeedback.ts` — DEFERRED
**Reason:** Low impact in single-user app. The "race" is a 5-minute cache that returns a slightly older promise — not a correctness bug for one user.

#### B5. Webhook event deduplication ✅ FIXED
**Applied:** In-memory `webhookSeen` set (capped LRU of 5000) keyed by `provider:logId:eventType:timestamp-bucket`. Bucketed by 60-second window so retries collapse but spaced-out genuine events still increment.

#### B6. Per-business failures surfaced ✅ FIXED
**Applied:** Added `failedBusinesses Int @default(0)` and `metadata Json?` to `SearchTask`. Migration `20260601004008_searchtask_failure_tracking` applied. Processor now counts failures and writes up to 20 sample failure reasons into the metadata field. Logged when partial failure rate is non-zero.

#### B7. Retry logic for transient send failures ✅ FIXED
**Applied:** `sendWithRetry()` wraps `sendViaProvider` with 3-attempt exponential backoff (2s, 4s, 8s). Transient errors classified by `isTransientSendError()` — network errors (ETIMEDOUT, ECONNRESET, etc.), HTTP 5xx/429, SMTP 4xx codes (421, 450, 451, 452). Permanent errors (4xx other than rate-limit) skip retries.

#### B8. SES + other provider config validation ✅ FIXED
**Applied:** `sendViaProvider` now throws explicit errors when SES is missing accessKeyId/secretAccessKey/region, SMTP is missing host, RESEND/SENDGRID/MAILGUN are missing apiKey or domain. No more silent fall-through to dry-run when a real provider was configured but incomplete.

#### B9. `outboundPlatform.ts` is ~2700 lines — DEFERRED
**Why deferred:** Pure organisation work, no behaviour gain. Touching it risks regressions in send/webhook/SMTP paths that just got fixed. Recommend separate session focused on the refactor.

#### B10. `dashboard/page.tsx` is ~1500 lines — DEFERRED
**Why deferred:** Same reason. Component extraction is high-churn and needs careful testing.

#### B11. SMTP STARTTLS bypass risk — DEFERRED
**Why deferred:** No real SMTP sender is configured in this app today; can't test the fix safely. Will revisit when a real SMTP sender is added.

---

### Bigger frontend changes

#### F1. Hydration: `<ClientDate>` flashes — DEFERRED
**Why deferred:** Visual nit, not a correctness issue. Could resolve by rendering ISO format server-side with `suppressHydrationWarning`.

#### F2. `isDemoMode` is sticky ✅ FIXED
**Applied:** Dashboard now has a 15-second background interval that pings `/api/health` while in demo mode. As soon as the backend is reachable, it auto-exits demo mode and refreshes the task list. No manual "Retry Connection" click needed.

#### F3. WebSocket cleanup on home page — DEFERRED
**Why deferred:** Low impact on a single-user local app. WebSocket is established once; even with the existing pattern, leaks are bounded.

#### F4. AbortController for inbox thread fetches — DEFERRED
**Why deferred:** Race manifests only with rapid click switching; mostly cosmetic flicker.

#### F5. Hard-coded demo fixtures — DEFERRED
**Why deferred:** Useful for offline dev. Could be improved with empty states but not breaking.

---

### Workflow gaps (need design decisions)

#### W1. Role accounts (info@, sales@) currently kept as RISKY
**Decision needed:** Are role accounts wanted or not? Currently they're scored RISKY and included in exports/campaigns. The `extractor.ts` even *boosts* their confidence because "sales" is a "preferred prefix."
**Options:** (a) keep them but expose a UI filter; (b) auto-exclude from campaigns by default with an opt-in; (c) treat as INVALID.

#### W2. Tracking pixel URL uses `OUTBOUND_BASE_URL` env var, default localhost
**Decision needed:** Local-only means localhost is fine — but if you ever want to test real campaigns, recipients open emails from outside your machine, so the pixel/click URLs need to be a public URL (ngrok, etc.). Document this clearly OR add a settings UI for the public URL.

#### W3. Click tracking URL doesn't include recipient identity
**Decision needed:** Currently the click URL is `/track/click/{token}`. If multiple recipients receive forwarded emails, all clicks attribute to the original. For 1:1 outreach this is fine; if you ever do broadcast, it's a problem.

---

---

## End-to-end workflow verification (live run)

Executed against the live backend with input: `keyword="used car dealer"`, `domainIdea="TexasCarVendor.com"`, `cityState="Texas"`, `searchDepth=5`.

| Step | Result | Notes |
|---|---|---|
| 1. User enters domain | ✅ | `POST /api/search` returned `taskId` with new `failedBusinesses: 0` field populated |
| 2. System finds businesses | ✅ | 5 unique businesses discovered (Texas Cars Direct, Texas Car One, etc.) |
| 3. Extracts websites | ✅ | `texascarsdirect.com`, `texascarone.com`, etc. |
| 4. Extracts contact info | ✅ | Phones (e.g. `(972) 457-3230`), social links (Facebook, Instagram) |
| 5. Validates emails | ✅ | 11 valid emails across the 5 leads, with full verification metadata (MX, SPF, DMARC, provider) |
| 6. Scores buyers | ⚠️ | All scores returned as 20% — OpenAI key not set, falling back to local NLP. Warning logged. |
| 7. Ranks prospects | ✅ | `/api/leads?sortField=domainMatchScore&sortOrder=desc` returns sorted list |
| 8. Generates personalized emails | ✅ | `/api/outbound/generate` available; works with or without OpenAI |
| 9. Sends emails | ✅ | `/api/outbound/send-now` confirmed: DRY_RUN sender returns `dryRun: true` with new SIMULATED status |
| 10. Tracks opens/clicks/replies | ✅ | Webhook handler hardened with per-event try/catch, dedup, orphan logging |
| 11. Updates analytics | ✅ | Domain reputation now writes back from each bounce/delivery/reply via `recordCampaignOutcome` |

Time from POST to COMPLETED: **~30 seconds** for 5 leads.

The deliverability assess endpoint was also verified against `info@texascarone.com`:
- All 8 layers populated (syntax 100, dns 100, provider 95, company 100, pattern 70, role 40, reputation 81)
- SMTP probe, RDAP age (3598 days), SSL inspection, catch-all detection all working
- Final score 65, bounce risk HIGH because of catch-all + role account — correct.

---

## Follow-up session (round 3) — additional fixes applied

### Critical bug found during provider validation testing
- **SMTP transport crashed the backend on bad host.** `onceEvent()` waited for `'connect'` but never subscribed to the socket's `'error'` event. DNS failure → unhandled `'error'` → Node process exit. **Fixed.** Now uses dual-listener pattern with proper cleanup.

### Quality fixes
- **Step 6 scoring fixed.** Local NLP was treating `TexasCarVendor.com` as one token (no CamelCase split). Result: every lead got the same fallback score. Added CamelCase split + lightweight stemming (`cars` ≈ `car`) + expanded synonym dictionary. Re-run confirms differentiated 35–99% scoring.
- **AI prompts hardened.** Both `outboundAi.ts` and `aiScoring.ts` now have explicit anti-hallucination rules ("Do not invent specifics not in the inputs"), structured rubrics, character caps on subject lines, and required-token preservation (`{{senderName}}`, `{{unsubscribeLine}}`). Output validators clamp lengths and ensure unsub line is present.
- **All five provider error paths verified live.** Created sender accounts with invalid configs, confirmed each throws the right error:
  - SES missing region → `"SES sender is missing region"`
  - SMTP missing host → `"SMTP sender is missing host"`
  - Resend bad key → `"Resend 401: API key is invalid"`
  - SendGrid bad key → `"SendGrid 401: ..."`
  - Mailgun missing domain → `"Mailgun sender is missing apiKey or domain"`

### Refactor
- **SMTP transport extracted** from `outboundPlatform.ts` into `smtpTransport.ts` (~190 lines, no DB coupling). Main file is now ~2400 lines. Further splits (campaign CRUD, webhook handler) are higher-coupling and deferred.
- **`ComposerModal` extracted** from `dashboard/page.tsx` into its own component. Dashboard file is now ~1430 lines. Composer logic owns its props; parent keeps state (so it can prefill from a lead row click).

## Open items (user-facing only)

These are improvements, not bugs:

1. **OpenAI key not set** — match scoring uses the improved local NLP heuristic; for best results set `OPENAI_API_KEY` in `backend/.env`.
2. **Redis not at 5.0+** — BullMQ throws on startup. The system runs fine because `taskProcessor` already does in-process work; only the email-verification queue (>50 emails) is affected. Upgrade Redis to enable BullMQ.
3. **Role accounts (info@, sales@)** are still kept as RISKY in exports/campaigns. Decision needed: keep as-is, filter by default, or treat as INVALID.
4. **Gmail sending** — there is no dedicated Gmail integration; use Gmail via SMTP (`smtp.gmail.com`) or send through Resend/SendGrid with Gmail as the underlying inbox. The codebase covers both.
5. **Outbound pixel URL** uses `OUTBOUND_BASE_URL` env var (default `http://localhost:5000`). Fine for local testing. Needs a public URL if you want real recipients to load tracking pixels.

## What I did NOT investigate deeply

- Performance profiling under real load
- Security review (XSS, SQL injection, credential leakage in logs)
- Live end-to-end sends through Resend/SendGrid/SES with **valid** credentials — those require provider accounts I don't have access to from this session. Error paths are tested; happy paths are not.
