# Scraping & Email Verification — A-Z Flow

## 1. User Search → Backend API

Frontend (`/dashboard`) sends `POST /api/search { keyword, domainIdea, cityState, searchDepth }` to `server.ts:80`.

Server creates a `SearchTask` (PENDING) in PostgreSQL and calls `startSearchTaskProcessing()`:

```
task = prisma.searchTask.create({ data: { ...status: 'PENDING' } });
startSearchTaskProcessing(task.id);
```

## 2. Task Processing Dispatch (`taskProcessor.ts`)

Two paths depending on Redis availability:
- **Redis available**: Enqueues to BullMQ `scraping-queue` (concurrency: 2)
- **Redis unavailable**: Runs inline in the same process (no-queue fallback)

## 3. Worker Phase — Discovery (`worker.ts:48-140`)

**3a. Generate query variations** — `generateQueryVariations()` expands keyword + location into multiple Google search queries

**3b. Serper.dev API calls:**
- `searchGooglePlaces(query)` → Google Maps results (name, website, address, rating, category)
- `searchGoogle(query)` → Organic search results (title, link)

**3c. Deduplication** — Businesses keyed by domain hostname. Organic results skip directory domains (Yelp, Facebook, LinkedIn, etc.).

## 4. Worker Phase — Crawl & Score (`worker.ts:159-235`)

For each discovered business (up to `searchDepth` limit):

```
                    ┌──────────────┐
                    │  Crawl Site  │  crawlWebsite() — Cheerio
                    │  homepage +  │  Fetches HTML, parses with Cheerio
                    │  4 inner pgs │  Scans raw HTML + text content
                    └──────┬───────┘  for email patterns
                           │
                           ▼
                    ┌──────────────┐
                    │  Extract +   │  validateAndCleanEmails()
                    │  Validate    │  (extractor.ts)
                    └──────┬───────┘
                           │
                           ▼
                    ┌──────────────┐
                    │   AI Score   │  calculateMatchScore() — NVIDIA LLM
                    │  Relevance   │  scores business-domain match 0-100
                    └──────┬───────┘
                           │
                           ▼
                    ┌──────────────┐
                    │  Save to DB  │  prisma.lead.create() +
                    │              │  prisma.leadEmail.createMany()
                    └──────────────┘
```

## 5. Crawler Details (`crawler.ts`)

- Fetches homepage HTML via axios
- Loads into Cheerio for DOM parsing
- Scans raw HTML + rendered text for email patterns (regex)
- **Decodes Cloudflare-protected emails** (`__cf_email__` data-cfemail attribute)
- Also finds: phone numbers, social links, contact forms, company size signals
- Recursively follows Contact/About page links (up to 4 inner pages)

## 6. Scrape-time Validation (`extractor.ts`)

```
validateEmail(email) → { status, confidenceScore }
```

**Steps:**
1. Regex syntax check
2. Phone-number-in-email rejection (e.g. `565-1220info`)
3. Placeholder/test domain filter
4. Disposable domain filter
5. **Typo detection** — catches `gmial.com`, `yaho.com`, etc.
6. MX record check (if no MX → INVALID)
7. Scoring: preferred prefix (+30%), custom domain (+20%), personal domain (-20%), etc.
8. **AI filter** — optional NVIDIA call to reject scrape artifacts (image filenames, CSS classes)

Result: `{ status: 'VALID'|'RISKY'|'INVALID', confidenceScore: 0.0-1.0 }`

Saved as `LeadEmail` with basic fields — **the deep verification hasn't run yet**.

## 7. Deep Email Verification (separate user action)

User clicks **"Verify Emails"** on the dashboard → `POST /api/email/verify-bulk` → calls `verifyEmailsBulk()` which runs `verifyEmail()` on each email.

### 9-step verification pipeline (`emailVerification.ts`):

```
Step 1 — Syntax check + TYPO DETECTION
    ↓
Step 2 — Domain validation (A/AAAA DNS records)
    ↓
Step 3 — MX records (primary host + priority)
    ↓
Step 4 — Disposable domain check
    ↓
Step 5 — Role account detection (info@, sales@, admin@...)
    ↓
Step 6 — Free provider check (gmail, yahoo, hotmail...)
    ↓
Step 7 — Provider detection + catch-all heuristic
    ↓
Step 8 — SPF/DMARC TXT records → reputation score (0-100)
    ↓
Step 9 — SMTP RCPT TO handshake
           MX:25 → EHLO → MAIL FROM:<> → RCPT TO:<email>
           Then RCPT TO:<fake-address> for catch-all detection
```

### Step 9 — SMTP RCPT in detail:

```
TCP connect to mx.domain.com:25
→ Read greeting (expect 220)
→ EHLO verify-domain-check (expect 250)
→ MAIL FROM:<> (expect 250)
→ RCPT TO:<real-email>
       250 → mailbox exists ✓  (or catch-all)
       550 → mailbox doesn't exist ✗

If mailbox accepted: second connection
→ RCPT TO:<nonexistent-xxxxx@domain>
       250 → catch-all domain (lower confidence)
       550 → mailbox verified ✓
```

### Final scoring:

| Score    | Status   | Recommendation                    |
|----------|----------|-----------------------------------|
| ≥75      | VALID    | Safe to send                      |
| 60–74    | RISKY    | Warmup or limit volume            |
| 40–59    | RISKY    | Low confidence                    |
| <40      | INVALID  | Exclude from campaigns            |
| Catch-all| RISKY    | Bounce risk elevated              |

## 8. Campaign Sending Flow (`outboundPlatform.ts`)

```
queueCampaignSends()
  → queries leads where LeadEmail.status = 'VALID' only
  → creates EmailLog records (status: QUEUED)

processOutboundQueueTick() — runs every ~30s
  → picks up due QUEUED emails (max 20)
  → PRE-SEND FRESHNESS CHECK: if verifiedAt > 7 days old,
    re-resolves MX records. If domain no longer has MX → CANCEL.
  → enforces campaign daily limit + sender hourly/daily limits
  → checks suppression list
  → sends via Resend/SMTP/SendGrid/SES
```

## 9. Bounce Feedback Loop

When a provider webhook arrives with `eventType === 'BOUNCED'`:

```
applyProviderEvent()
  → adds email to SuppressionEntry (prevents future sends)
  → updates LeadEmail: status = 'INVALID', confidenceScore = 0
    (campaigns will skip this email going forward)
  → stops sequence follow-ups
```

This means a bad email only bounces once — after that it's permanently marked INVALID so no campaign will ever pick it up again.
