# GeoLead AI Crawler System — Complete Architecture

> Use this document to understand the entire crawler pipeline end-to-end.
> Created: 2026-06-29

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [Component Map](#2-component-map)
3. [VM Python Crawler (FastAPI)](#3-vm-python-crawler-fastapi)
4. [Heroku Backend (Node.js)](#4-heroku-backend-nodejs)
5. [Full Search Task Flow (step by step)](#5-full-search-task-flow-step-by-step)
6. [Database Schema](#6-database-schema)
7. [Google Maps Scraping](#7-google-maps-scraping)
8. [Website Crawling & Email Extraction](#8-website-crawling--email-extraction)
9. [Proxy System](#9-proxy-system)
10. [Lead Enrichment Pipeline](#10-lead-enrichment-pipeline)
11. [Configuration Reference](#11-configuration-reference)
12. [API Endpoints](#12-api-endpoints)
13. [Deployment Setup](#13-deployment-setup)
14. [Troubleshooting](#14-troubleshooting)

---

## 1. Architecture Overview

```
┌──────────────────────────────────────────────────────────────────┐
│                    USER (Browser)                                │
│  frontend.geoleadai.com                                         │
└──────────────┬───────────────────────────────────────────────────┘
               │  HTTPS
               ▼
┌──────────────────────────────────────────────────────────────────┐
│                  HEROKU BACKEND (Node.js/Express)                │
│  geolead-ai-api.herokuapp.com                                    │
│                                                                  │
│  ┌──────────────┐  ┌─────────────────┐  ┌──────────────────┐   │
│  │ server.ts    │  │ taskProcessor.ts│  │ crawlerClient.ts │   │
│  │ (Express API)│  │ (orchestrator)  │  │ (HTTP client)    │   │
│  └──────────────┘  └─────────────────┘  └──────────────────┘   │
│         │                  │                     │              │
│         │                  │         ┌───────────┘              │
│         │                  ▼         ▼                          │
│         │         ┌──────────────────────┐                      │
│         │         │   Cloudflare Tunnel  │                      │
│         │         │  (trycloudflare.com) │                      │
│         │         └──────────┬───────────┘                      │
└─────────┼────────────────────┼──────────────────────────────────┘
          │                    │  HTTPS
          ▼                    ▼
┌──────────────────────────────────────────────────────────────────┐
│                   AZURE VM (crawler host)                        │
│  20.240.52.137                                                   │
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  FastAPI Server (uvicorn)                                │   │
│  │  /home/azureuser/crawl/app/                              │   │
│  │  ┌─────────┐ ┌────────┐ ┌──────────┐ ┌──────────┐     │   │
│  │  │routes.py│ │engine.py│ │ gmaps.py │ │search.py │     │   │
│  │  └─────────┘ └────────┘ └──────────┘ └──────────┘     │   │
│  │  ┌──────────┐ ┌───────────┐ ┌──────────┐ ┌──────┐   │   │
│  │  │fetcher.py│ │extractor.py│ │proxy.py  │ │kimi.py│   │   │
│  │  └──────────┘ └───────────┘ └──────────┘ └──────┘   │   │
│  │  ┌──────────┐ ┌────────────┐ ┌──────────┐          │   │
│  │  │robots.py │ │accuracy.py │ │limits.py │          │   │
│  │  └──────────┘ └────────────┘ └──────────┘          │   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                  │
│  ┌──────────────────────────────────────────────┐               │
│  │  Headless Chrome (PatchRight / Playwright)   │               │
│  │  - Renders Google Maps                       │               │
│  │  - Extracts business names, websites, phones │               │
│  │  - Scrolls results feed                      │               │
│  └──────────────────────────────────────────────┘               │
│                                                                  │
│  ┌──────────────────────────────────────────────┐               │
│  │  SQLite DB (data/contacts.db)               │               │
│  │  Tables: search_jobs, websites, contacts     │               │
│  └──────────────────────────────────────────────┘               │
└──────────────────────────────────────────────────────────────────┘
```

## 2. Component Map

| Component | Language | Location | Role |
|-----------|----------|----------|------|
| **Frontend** | TypeScript/React (Next.js) | `frontend/` | User interface for search, dashboard, campaigns |
| **Backend API** | TypeScript (Express) | `backend/src/server.ts` | REST API, auth, task management |
| **Task Processor** | TypeScript | `backend/src/services/taskProcessor.ts` | Orchestrates multi-query searches |
| **Crawler Client** | TypeScript | `backend/src/services/crawlerClient.ts` | HTTP client to talk to VM crawler |
| **VM Crawler** | Python (FastAPI) | VM at `/home/azureuser/crawl/app/` | Actually scrapes Google Maps + websites |
| **Browser Engine** | Python (PatchRight/Playwright) | `crawler/gmaps.py` | Headless Chrome for Maps scraping |
| **Website Crawler** | Python | `crawler/engine.py`, `crawler/fetcher.py` | HTTP fetching + email extraction |
| **Database (Backend)** | PostgreSQL | Heroku | Tasks, leads, campaigns, users |
| **Database (Crawler)** | SQLite | VM at `data/contacts.db` | Search jobs, websites, contacts |

---

## 3. VM Python Crawler (FastAPI)

### 3.1 Directory Structure

```
/home/azureuser/crawl/
├── .env                          # Environment config
├── app/
│   ├── main.py                   # FastAPI entry point
│   ├── config.py                 # Settings (pydantic)
│   ├── auth.py                   # API key middleware
│   ├── routes.py                 # REST routes
│   ├── models.py                 # SQLAlchemy models
│   ├── schemas.py                # Pydantic request/response schemas
│   ├── database.py               # SQLAlchemy engine/session
│   ├── export.py                 # CSV/TXT/JSON export
│   ├── crawler/
│   │   ├── __init__.py
│   │   ├── engine.py             # Main crawler engine (run_search_job)
│   │   ├── gmaps.py              # Google Maps scraping (PatchRight)
│   │   ├── search.py             # Web search via Scrapling
│   │   ├── fetcher.py            # HTTP request fetcher
│   │   ├── extractor.py          # Email/phone/social extraction
│   │   ├── proxy.py              # Proxy pool management
│   │   ├── proxy_sources.py      # Free proxy harvest sources
│   │   ├── accuracy.py           # Relevance scoring
│   │   ├── kimi.py               # Kimi AI (NVIDIA NIM) integration
│   │   ├── robots.py             # robots.txt cache
│   │   └── limits.py             # Global job slot limiter
│   ├── templates/                # Jinja2 templates
│   └── static/                   # Static assets
├── data/
│   └── contacts.db               # SQLite database
└── .venv/                        # Python virtual env
```

### 3.2 Key Dependencies (from pyproject.toml / .venv)

- **fastapi** / **uvicorn** — Web server
- **sqlalchemy** — ORM
- **patchright** (Playwright fork) — Headless browser control
- **beautifulsoup4** + **lxml** — HTML parsing
- **httpx** — Async HTTP client
- **pydantic-settings** — Config management
- **jinja2** — HTML templates

### 3.3 `app/main.py` — Entry Point

```python
app = FastAPI(title="Business Contact Discovery Platform", version="1.0.0")
app.add_middleware(ApiKeyMiddleware)  # Protects /api/* routes

@app.on_event("startup")
def on_startup():
    init_db()  # Creates SQLite tables

app.include_router(router)  # All routes

@app.get("/health")
def health():
    return {"status": "ok", "app": settings.app_name}
```

### 3.4 `app/config.py` — Key Settings

| Setting | Default | Description |
|---------|---------|-------------|
| `database_url` | `sqlite:///./data/contacts.db` | Crawler's own DB |
| `search_provider` | `stealth` | `stealth` (browser), `mojeek`, or `duckduckgo` |
| `max_results` | `50` | Max URLs per search job |
| `max_concurrency` | `8` | HTTP fetch concurrency |
| `maps_concurrency` | `2` | Concurrent Google Maps browsers |
| `maps_timeout_ms` | `90000` | Maps page timeout per place |
| `browser_concurrency` | `3` | Concurrent Scrapling browsers |
| `free_proxy_enabled` | `True` | Auto-harvest free proxies |
| `api_key` | *(set in .env)* | Auth key for API access |
| `global_max_jobs` | `2` | Max concurrent search jobs on VM |
| `job_timeout_s` | `900` (15 min) | Max job runtime before kill |
| `low_cpu` | `False` | If True, reduces resource usage |
| `kimi_enabled` | `False` | NVIDIA NIM AI for relevance scoring |

### 3.5 `app/routes.py` — API Endpoints (see Section 12)

### 3.6 `app/models.py` — ORM Models

**SearchJob** — Tracks one crawl job:
- `id` (int PK), `keyword`, `region`, `max_results`, `delay`, `source` ("web"|"google_maps")
- `emails_only`, `proxies`, `proxyscrape_enabled`, `aggressive_mode`
- `status` ("pending"|"running"|"paused"|"completed"|"stopped"|"failed")
- `total_urls`, `processed_urls`, `contacts_found`
- `error`, `created_at`, `finished_at`

**Website** — One discovered business:
- `id` (int PK), `domain` (unique), `url`, `title`, `company_name`
- `contact_page`, `address`, `keyword`, `job_id` (FK)
- `source` ("web"|"google_maps"), `relevance` (0-1 float)
- `rating`, `reviews_count`, `category`
- `scanned_at`

**Contact** — Contact info for a website:
- `id` (int PK), `website_id` (FK)
- `contact_type` ("email"|"phone"|"contact_form"|"linkedin"|"facebook"|etc)
- `contact_value`, `source_url`, `discovered_at`
- Unique constraint on (website_id, contact_type, contact_value)

### 3.7 `app/auth.py` — API Key Middleware

- Checks `X-API-Key` header or `?api_key=` query param on all `/api/*` routes
- Uses HMAC constant-time comparison (`hmac.compare_digest`)
- No-op when `api_key` is empty in config (local dev)

---

## 4. Heroku Backend (Node.js)

### 4.1 Key Files

| File | Purpose |
|------|---------|
| `backend/src/server.ts` | Express server setup, routes, startup |
| `backend/src/services/taskProcessor.ts` | Orchestrates full search task lifecycle |
| `backend/src/services/crawlerClient.ts` | HTTP client for VM crawler API |
| `backend/src/services/settings.ts` | Reads per-user settings from DB |
| `backend/src/workers/worker.ts` | BullMQ worker alternative |
| `backend/src/config/db.ts` | Prisma client setup |
| `backend/src/middleware/auth.ts` | JWT auth middleware |
| `backend/prisma/schema.prisma` | Database schema (see Section 6) |

### 4.2 `taskProcessor.ts` — The Orchestrator

This is the brain. It runs **inside the Heroku web process** (not a separate worker).

**Flow:**
1. Receives task ID from `POST /api/search`
2. Sets status to `PROCESSING`, progress to 5
3. Calls `buildSearchQueries()` to generate up to 10 keyword variants (see 4.3)
4. For EACH query:
   - Calls `searchAndCrawl()` which talks to the VM crawler
   - Waits for the crawler job to complete (polls every 3s, max 40min)
   - Fetches results from the crawler
   - Deduplicates businesses by domain
5. After all queries: sorts by relevance, trims to `searchDepth`, starts enrichment per-business
6. For each business: website crawl → email validation → email guessing → reverse whois → AI scoring → DM discovery → buyer intent → domain fit → create Lead + LeadEmail records
7. Updates progress incrementally, writes `totalLeads` and `validEmails`

**Concurrency control:**
- `MAX_CONCURRENT_SEARCHES` env var (default 2)
- Tasks queue if at capacity
- Per-business enrichment timeout: `PER_BUSINESS_ENRICH_TIMEOUT_MS` (default 45000ms = 45s)

### 4.3 Query Generation (`buildSearchQueries`)

Takes a keyword + cityState, generates up to 10 queries:

1. **Primary**: `"{keyword} {city}, {state}"` (e.g., "roofing contractors Dallas, TX")
2. **Keyword expansions**: Uses `KEYWORD_EXPANSIONS` map to find related terms
   - e.g., `roofing` → `["roofer", "roof repair", "roof replacement", "roofing contractor"]`
3. **Proximity cities**: Uses `PROXIMITY_CITIES` map to nearby cities
   - e.g., Dallas, TX → Fort Worth, Arlington, Plano, Garland, Irving, Carrollton, Frisco, McKinney, Richardson

### 4.4 `crawlerClient.ts` — VM Crawler HTTP Client

**`searchAndCrawl()`:**
1. Reads `crawlerBaseUrl` and `crawlerApiKey` from user's settings table
2. Health checks the VM crawler (`GET /health`)
3. POSTs to VM to start a search job (`POST /api/search`)
4. Polls every 3 seconds (`GET /api/jobs/{id}`) for up to 40 minutes
5. On completion, fetches results (`GET /api/searches/{id}/results`) with pagination (100/page)
6. Returns `{ results: CrawlerBusiness[], jobId: number }`

**`pollJob()`:**
- Polls every 3 seconds
- 40 minute timeout max
- Calls `onProgress` callback (updates Heroku task progress to ~10-29%)
- Handles: completed, stopped, failed, timeout
- Transient errors (502, 504, ECONNRESET) → retries automatically

**`fetchResults()`:**
- Paginated GET to `/api/searches/{id}/results`
- 3 retry attempts with 3s backoff
- Returns structured `CrawlerBusiness[]` with emails, phones, socials, contact forms

---

## 5. Full Search Task Flow (Step by Step)

### Step 1: User Creates Search (Frontend)
```
POST /api/search
Body: { keyword, cityState, domainIdea, searchDepth, searchSource }
Response: { id: "task-uuid", status: "PENDING", progress: 0 }
```

### Step 2: Backend Accepts Task (server.ts)
- Creates `SearchTask` record in PostgreSQL
- Calls `startSearchTaskProcessing(task.id)`

### Step 3: Task Processor Starts
- Sets task to `PROCESSING` status, progress 5%
- Generates search queries (up to 10)
- Sets progress to 10%

### Step 4: For Each Query → VM Crawler

**4a. `searchAndCrawl()` is called:**
- Reads `crawlerBaseUrl` from user settings (e.g., Cloudflare tunnel URL)
- Health checks the VM
- POSTs to VM to start a job

**4b. VM Crawler receives request:**
- Creates `SearchJob` record in SQLite (status: "pending")
- Enqueues background task `run_search_job(job_id)`

**4c. `run_search_job()` executes:**
1. Acquires global job slot (max 2 concurrent)
2. Sets job status to "running"
3. If source is "google_maps":
   - Calls `gmaps.search_places()` → Uses headless Chrome to load Google Maps
   - Scrolls the results feed to find businesses
   - Returns list of {name, place_url, rating, reviews, category}
4. Sets `job.total_urls` (e.g., 110)
5. For each Maps business:
   - Calls `gmaps.place_details()` → Opens each place page in Chrome
   - Extracts website, phone, address
   - If website exists: calls `_crawl_site()` to HTTP-fetch the site
   - Runs `extractor.extract_emails()`, `extract_phones()`, `extract_social_links()`
   - Runs `accuracy.relevance_score()` + optional Kimi AI evaluation
   - Stores results in SQLite `websites` and `contacts` tables
   - Increments `processed_urls`
6. On completion: sets job status to "completed"

**4d. Heroku polls for completion:**
- Every 3 seconds, GET `/api/jobs/{id}`
- When status is "completed" → calls `fetchResults()`

**4e. `fetchResults()`:**
- Paginated GET to `/api/searches/{id}/results`
- Returns all websites with their contacts, deduped by the VM

### Step 5: Heroku Processes Results

For each result from the crawler:
- Filters out: no-contact, no-domain, wrong-country
- Deduplicates by domain across all queries
- Scores businesses for relevancy ranking
- Applies search context filtering (city, state, keyword)

### Step 6: Heroku Creates Leads (Enrichment Pipeline)

After all queries complete:
- Sorts businesses by relevance score
- Trims to `searchDepth` (e.g., top 100)
- For each business (in parallel, concurrency=3):

```
1. crawlWebsite()      → HTTP crawl the business website
2. validateAndCleanEmails() → AI + regex email filtering
3. Email Guessing       → If no emails found, guess common patterns
4. Reverse Whois        → If still no emails, lookup domain WHOIS
5. verifyEmailsBulk()   → SMTP/MX verification
6. calculateMatchScore() → Domain match scoring
7. scoreContactIntel()  → Contact channel scoring
8. getCompanyIntel()    → Company data enrichment
9. discoverDecisionMaker() → AI-powered decision maker detection
10. analyzeBuyerIntent() → Buyer intent prediction
11. scoreDomainFit() → Domain upgrade potential scoring
12. scoreBusinessQuality() → Overall quality score
```

Each business gets a:
- **Lead** record (business info, scores, pipeline data)
- **LeadEmail** record(s) (verified emails with status, risk scores)

### Step 7: Finalize
- Sets task status to `COMPLETED`
- Stores `totalLeads`, `validEmails`, `failedBusinesses`
- Progress: 100%

---

## 6. Database Schema

### 6.1 PostgreSQL (Heroku Backend) — via Prisma

**Model: SearchTask**
```
id              String  @id @uuid
userId          String
keyword         String
domainIdea      String?
country         String?
cityState       String?
searchDepth     Int     @default(100)
status          String  @default("PENDING")   // PENDING|PROCESSING|COMPLETED|FAILED|CANCELLED|PAUSED
progress        Int     @default(0)
totalLeads      Int     @default(0)
validEmails     Int     @default(0)
failedBusinesses Int    @default(0)
metadata        Json?
createdAt       DateTime
updatedAt       DateTime
leads           Lead[]
```

**Model: Lead**
```
id              String  @id @uuid
taskId          String
ownerId         String
businessName    String
website         String?
location        String?
googleMapsLink  String?
category        String?
rating          Float?
reviewsCount    Int?
phoneNumbers    String[]
socialLinks     String[]
emails          LeadEmail[]
domainMatchScore    Int?
scoreExplanation    String?
companySize     String?
summary         String?
notes           String?
decisionMakerName   String?
decisionMakerRole   String?
decisionMakerScore  Int?
decisionMakerEmail  String?
buyerIntentScore    Int?
domainUpgradeScore  Int?
businessQualityScore Int?
priorityScore       Int?
contactStrategy     String?  // "email_decision_maker"|"email_general"|"call_business"|"contact_form"
whatsappScore       Int?
whatsappConfidence  Int?
bestContactChannel  String?
contactChannelScores Json?
pipelineStage       String? @default("New")
tags                String[]
createdAt           DateTime
updatedAt           DateTime
```

**Model: LeadEmail**
```
id              String  @id @uuid
leadId          String
email           String
status          String?   // "VALID"|"INVALID"|"RISKY"|"UNKNOWN"|"GUESSED"
confidenceScore Float?
sourcePage      String?
provider        String?
mxHost          String?
mxValid         Boolean?
disposable      Boolean?
roleAccount     Boolean?
freeProvider    Boolean?
catchAllRisk    String?   // "LOW"|"MEDIUM"|"HIGH"
riskLevel       String?
reputationScore Int?
verifiedAt      DateTime?
verificationMetadata Json?
createdAt       DateTime
updatedAt       DateTime
```

### 6.2 SQLite (VM Crawler)

**search_jobs**
```
id            INTEGER PRIMARY KEY
keyword       TEXT NOT NULL
region        TEXT
max_results   INTEGER DEFAULT 100
delay         TEXT
source        TEXT DEFAULT 'web'     // "web" | "google_maps"
emails_only   INTEGER DEFAULT 0
proxies       TEXT
proxyscrape_enabled INTEGER DEFAULT 0
aggressive_mode     INTEGER DEFAULT 0
status        TEXT DEFAULT 'pending'  // pending|running|paused|completed|stopped|failed
total_urls    INTEGER DEFAULT 0
processed_urls INTEGER DEFAULT 0
contacts_found INTEGER DEFAULT 0
error         TEXT
created_at    DATETIME
finished_at   DATETIME
```

**websites** (unique on domain)
```
id            INTEGER PRIMARY KEY
domain        TEXT NOT NULL UNIQUE
url           TEXT NOT NULL
title         TEXT
company_name  TEXT
contact_page  TEXT
address       TEXT
keyword       TEXT
job_id        INTEGER REFERENCES search_jobs(id)
source        TEXT DEFAULT 'web'      // "web" | "google_maps"
relevance     FLOAT DEFAULT 0.0
rating        FLOAT
reviews_count INTEGER
category      TEXT
scanned_at    DATETIME
```

**contacts** (unique on website_id + contact_type + contact_value)
```
id            INTEGER PRIMARY KEY
website_id    INTEGER REFERENCES websites(id) ON DELETE CASCADE
contact_type  TEXT NOT NULL    // email|phone|contact_form|linkedin|facebook|instagram|twitter|youtube
contact_value TEXT NOT NULL
source_url    TEXT
discovered_at DATETIME
```

---

## 7. Google Maps Scraping

### 7.1 Overview

The Maps scraper lives in `app/crawler/gmaps.py` and uses **PatchRight** (a Playwright-compatible library) to launch headless Chromium. It does NOT use the Google Maps API — it renders the actual Maps website.

### 7.2 Two-Phase Approach

**Phase 1: `search_places()` — Collect businesses from search results**
1. Opens `https://www.google.com/maps/search/{keyword}?hl=en&gl={country}`
2. Scrolls the results feed left panel repeatedly to load more businesses
3. Extracts from each card: name, place URL, rating, reviews count, category
4. Returns list of dicts with `{name, place_url, rating, reviews_count, category}`
5. Retries up to 2x (with/without proxy) if zero results

**Phase 2: `place_details()` — Extract contact info per business**
1. Opens each individual place page: `https://www.google.com/maps/place/{data_id}`
2. Clicks the website button to get the URL
3. Reads phone, address from the detail panel
4. Uses stable CSS selectors like `a[data-item-id="authority"]` for website, `button[data-item-id^="phone"]` for phone
5. Returns `{name, website, phone, address}`

### 7.3 Key Selectors

```python
WEBSITE_SELECTORS = [
    'a[data-item-id="authority"]',
    'a[data-item-id^="authority"]',
    'a[aria-label^="Website:"]',
    'a[aria-label*="Website" i]',
    'a[data-tooltip="Open website"]',
    'a[data-tooltip*="website" i]',
    'a.CsEnBe[href^="http"]',
]
PHONE_SELECTORS = [
    'button[data-item-id^="phone"]',
    'button[aria-label^="Phone:"]',
    'button[data-tooltip*="phone" i]',
]
ADDR_SELECTORS = [
    'button[data-item-id="address"]',
    'button[aria-label^="Address"]',
]
```

### 7.4 Scroller Function

The scroller is a callback passed to `_fetch()` that:
1. Finds the feed panel via selectors (`div[role="feed"]`, `div.Nv2PK`, etc.)
2. Repeatedly scrolls down to load more results
3. Stops when: target count reached, or no new cards load after 3 consecutive scrolls
4. Returns all card elements found

### 7.5 Browser Configuration

- **Headless**: True
- **Stealth mode**: Yes (spoofs navigator.webdriver, WebGL, etc.)
- **User agent**: Randomized via `browserforge`
- **Timeout**: 90s per Maps page (`maps_timeout_ms`)
- **Concurrency**: `maps_concurrency` (default 2, overridden to 1 on low-cpu)

---

## 8. Website Crawling & Email Extraction

### 8.1 `_crawl_site()` (engine.py)

For each business website discovered:
1. Check robots.txt allowance
2. Fetch landing page (HTTP via `fetcher.fetch()`)
3. Parse with BeautifulSoup
4. Run `extractor.extract_emails()` on HTML + text
5. Run `extractor.extract_phones()` on text
6. Run `extractor.extract_social_links()` for LinkedIn, Facebook, etc.
7. Find contact pages, about pages (regex-based URL matching)
8. In deep crawl mode: also find team, staff, management pages
9. Crawl each discovered internal page (up to `max_pages_per_site` = 8)
10. Run relevance scoring (see 8.3)
11. Persist to SQLite via `_persist()`

### 8.2 Email Extraction (`extractor.py`)

- Uses multiple regex patterns for obfuscation-resistant email matching
- Handles: `mailto:`, plain text, `[at]` / `[dot]` obfuscation
- Phone extraction: US/UK/international formats with various separators
- Social link extraction: parses `href` attributes for known platforms
- Contact form detection: looks for `<form>` with `action` containing "contact" or method="post"

### 8.3 Relevance Scoring (`accuracy.py`)

**Heuristic scoring** (always runs):
- Keyword presence in domain name
- Keyword presence in page title
- Keyword density in body text
- Domain TLD bonus
- Returns a float 0.0-1.0

**Kimi AI scoring** (optional, if enabled):
- Uses NVIDIA NIM API (OpenAI-compatible)
- `kimi-k2.6` model
- Evaluates: is the site a real business matching the keyword?
- Returns: `{score, is_match, company_name, reason}`
- Blended: 70% Kimi score + 30% heuristic score

### 8.4 `fetcher.py` — HTTP Requests

- Uses `httpx` for async HTTP
- Supports proxies (HTTP, SOCKS4, SOCKS5)
- Identity rotation: randomized headers, accept-language, etc.
- Retry logic: on failure, tries without proxy immediately
- Exponential backoff on repeated failures

---

## 9. Proxy System

### 9.1 Overview

The crawler has a sophisticated proxy system in `app/crawler/proxy.py`. It automatically harvests free proxies from multiple sources and manages a pool.

### 9.2 Proxy Pool (`ProxyPool`)

- Thread-safe pool of `ProxyHealth` objects
- Each proxy tracked: URL, latency, anonymous level, fail count, cooldown
- `next(host)`: Returns next proxy, with sticky-per-domain option (same proxy for same host)
- `report_success(proxy, host)`: Resets fail count
- `report_failure(proxy, host, hard)`: Increments fail count; on `hard=True`, immediately removes

### 9.3 Proxy Sources (`proxy_sources.py`)

Harvests from multiple free proxy lists:
- `proxyscrape_free` — Free proxy API
- `geonode` — GeoNode API
- `proxy_list_download` — proxy-list.download
- `openproxylist` — Open Proxy List
- `github_speedx` — GitHub: speedx proxy list
- `github_monosans` — GitHub: monosans proxy list

### 9.4 Validation

- Each harvested proxy is tested against `https://api.ipify.org?format=json`
- Workers: `proxy_validation_workers` (default 50)
- Timeout: `proxy_validate_timeout` (default 4s)
- Min pool size: `proxy_min_pool` (default 25)
- Refill threshold: `proxy_refill_threshold` (default 8)

### 9.5 Flow

1. On job start, proxy harvesting begins in background thread
2. Initial search/Maps scraping tries without proxies first (direct connection)
3. As proxies become available, they're used for subsequent HTTP requests
4. Dead proxies are dropped immediately with fallback to direct connection
5. Per-domain sticky proxies ensure consistency

---

## 10. Lead Enrichment Pipeline

After the VM crawler returns raw results, the Heroku backend enriches each lead:

### 10.1 Email Validation & Cleaning
```
crawlWebsite() → extract emails from site HTML
validateAndCleanEmails() → regex cleanup, dedup, format check
aiFilterEmails() → AI model to filter out non-business emails
```

### 10.2 Email Guessing (if no emails found)
```
guessEmailsForDomain():
  - Common prefixes: info@, contact@, hello@, sales@, admin@, support@
  - Name-based: firstname@, firstname.lastname@, firstnamelastname@
  - Industry: estimates@, service@
  - Verifies guesses via SMTP/MX check
```

### 10.3 Reverse WHOIS (if still no emails)
```
lookupDomainOwner(domain):
  - WHOIS lookup for registrant email
  - Falls back to historical WHOIS data
```

### 10.4 Email Verification (`emailVerification.ts`)
```
verifyEmailsBulk(emails, timeout):
  - MX record check (valid mail server?)
  - SMTP handshake (RCPT TO validation)
  - Disposable domain detection
  - Role account detection (info@, sales@)
  - Free provider detection (gmail.com, yahoo.com)
  - Catch-all risk assessment
  - Reputation scoring
  Returns: { email, status, confidenceScore, provider, mxValid, disposable, ... }
```

### 10.5 AI Scoring Pipeline

| Score | Range | Source | Purpose |
|-------|-------|--------|---------|
| `domainMatchScore` | 0-100 | `calculateMatchScore()` | Keyword relevance to user's domain idea |
| `decisionMakerScore` | 0-100 | `discoverDecisionMaker()` | Likelihood the contact is a DM |
| `buyerIntentScore` | 0-100 | `analyzeBuyerIntent()` | Likelihood they'd buy a geo-domain |
| `domainUpgradeScore` | 0-100 | `scoreDomainFit()` | Does their domain match their business name? |
| `businessQualityScore` | 0-100 | `scoreBusinessQuality()` | Business size, reviews, sophistication |
| `priorityScore` | 0-100 | Weighted blend | DM(35%) + Intent(25%) + Quality(20%) + Fit(20%) |
| `whatsappScore` | 0-100 | `scoreContactIntelligence()` | WhatsApp availability confidence |

### 10.6 Contact Strategy Decision

```javascript
if (dmScore >= 85 && hasEmail)  → "email_decision_maker"
else if (hasEmail)                → "email_general"
else if (hasPhone)                → "call_business"
else                              → "contact_form"
```

---

## 11. Configuration Reference

### 11.1 VM Crawler `.env` Variables

| Variable | Example | Purpose |
|----------|---------|---------|
| `API_KEY` | `0SbE0ZIU9Ds7UhShLqT4rt4ETO664pO6VvbgCi-L1dM` | API auth key |
| `SEARCH_API_KEY` | *(empty)* | Reserved for paid search APIs |
| `KIMI_API_KEY` | `nvapi-...` | NVIDIA NIM API key for AI scoring |
| `DATABASE_URL` | `sqlite:///./data/contacts.db` | SQLite path |

### 11.2 VM Crawler Settings (from `config.py`)

**Performance:**
- `max_concurrency`: 8 HTTP workers
- `maps_concurrency`: 2 browser instances
- `browser_concurrency`: 3 Scrapling browsers
- `max_pages_per_site`: 8 pages per website
- `global_max_jobs`: 2 simultaneous crawler jobs
- `job_timeout_s`: 900 (15 min per job)

**Request behavior:**
- `request_delay`: 1.0s base between requests
- `delay_jitter_min/max`: 0.4-1.6x random multiplier
- `request_timeout`: 15s per HTTP request
- `max_retries`: 1 retry per URL
- `respect_robots`: True (unless aggressive mode)

**Proxies:**
- `free_proxy_enabled`: True
- `proxy_validation_workers`: 50
- `proxy_validate_timeout`: 4s
- `proxy_min_pool`: 25 proxies
- `proxy_refill_threshold`: 8
- `proxy_max_harvest`: 500
- `proxy_fail_cooldown`: 90s
- `proxy_max_consecutive_fails`: 3

**Google Maps:**
- `maps_timeout_ms`: 90000 (90s per place page)
- `maps_concurrency`: 2 browsers

**Scrapling browser:**
- `use_scrapling`: True
- `use_stealth`: True
- `headless`: True
- `stealth_timeout_ms`: 35000 (35s per page)
- `block_resources`: True (skip images/fonts)

### 11.3 Heroku Backend Environment

| Variable | Purpose |
|----------|---------|
| `DATABASE_URL` | PostgreSQL connection string |
| `REDIS_URL` | Redis for BullMQ queues |
| `JWT_SECRET` | JWT signing key |
| `SMTP_*` | SMTP credentials |
| `IMAP_*` | IMAP credentials for inbox sync |
| `ENRICH_CONCURRENCY` | Default 3, concurrent business enrichment |
| `MAX_CONCURRENT_SEARCHES` | Default 2, simultaneous search tasks |
| `PER_BUSINESS_ENRICH_TIMEOUT_MS` | Default 45000, per-lead timeout |

### 11.4 User Settings (stored in `Setting` table)

| Key | Purpose |
|-----|---------|
| `crawlerBaseUrl` | Cloudflare tunnel URL (e.g., `https://xxx.trycloudflare.com`) |
| `crawlerApiKey` | API key for VM crawler auth |

---

## 12. API Endpoints

### 12.1 VM Crawler (FastAPI)

| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | `/health` | Health check |
| POST | `/api/search` | Start a new search job |
| GET | `/api/jobs/{id}` | Get job status |
| GET | `/api/jobs` | List recent jobs |
| POST | `/api/jobs/{id}/pause` | Pause a running job |
| POST | `/api/jobs/{id}/resume` | Resume a paused job |
| POST | `/api/jobs/{id}/stop` | Stop a job |
| GET | `/api/search-web` | Lightweight web search (URLs only) |
| GET | `/api/results` | Filtered results across all jobs |
| GET | `/api/stats` | Aggregate statistics |
| GET | `/api/searches` | List all search jobs with counts |
| GET | `/api/searches/{id}/results` | Paginated results for one job |
| GET | `/api/export/{csv\|txt\|json}` | Export results |

**Auth**: All `/api/*` routes require `X-API-Key` header or `?api_key=` query param.

### 12.2 Heroku Backend (Express)

| Method | Endpoint | Purpose |
|--------|----------|---------|
| POST | `/api/auth/login` | Login |
| POST | `/api/auth/register` | Register |
| POST | `/api/search` | Create search task |
| GET | `/api/tasks/:id` | Get task status + leads |
| GET | `/api/tasks` | List user's tasks |
| POST | `/api/tasks/:id/cancel` | Cancel a task |
| POST | `/api/tasks/:id/pause` | Pause a task |
| POST | `/api/tasks/:id/resume` | Resume a paused task |
| POST | `/api/tasks/:id/restart` | Restart a failed task |
| GET | `/api/leads/:id` | Get lead details |
| GET | `/api/settings` | Get user settings |
| POST | `/api/settings` | Update user settings |

---

## 13. Deployment Setup

### 13.1 VM Startup Sequence

```bash
# 1. SSH into Azure VM
ssh -i key.pem azureuser@20.240.52.137

# 2. Start the FastAPI server
cd /home/azureuser/crawl
source .venv/bin/activate
nohup python -m uvicorn app.main:app --host 127.0.0.1 --port 8000 &

# 3. Start Cloudflare tunnel (to expose localhost:8000)
nohup cloudflared tunnel --no-autoupdate --url http://127.0.0.1:8000 &

# 4. Get the tunnel URL from cloudflared logs
# Looks like: https://xxx.trycloudflare.com

# 5. Update Heroku with the new tunnel URL
heroku config:set CRAWLER_BASE_URL="https://xxx.trycloudflare.com" -a geolead-ai-api
```

### 13.2 Heroku Deployment

```bash
# Deploy backend
cd backend
git push heroku main

# Set config vars
heroku config:set JWT_SECRET=... -a geolead-ai-api
heroku config:set DATABASE_URL=... -a geolead-ai-api
heroku config:set REDIS_URL=... -a geolead-ai-api
```

### 13.3 Key: Cloudflare Tunnel

Each time `cloudflared` restarts, it gets a **NEW random URL**. You must update `CRAWLER_BASE_URL` in Heroku config:
```bash
heroku config:set CRAWLER_BASE_URL="https://NEW-URL.trycloudflare.com" -a geolead-ai-api
```

---

## 14. Troubleshooting

### 14.1 Common Issues

| Symptom | Likely Cause | Fix |
|---------|-------------|-----|
| "Crawler is offline" error | Cloudflare tunnel URL changed | Run `cloudflared tunnel...` on VM, update Heroku config |
| Task stuck at 12% progress | VM crawler job running but slow | Check VM load (`uptime`), check crawler job status (`GET /api/jobs/{id}`) |
| Zero leads found | Google Maps blocked / no businesses | Try without proxies, check Maps accessibility from VM IP |
| Emails not found | Website blocking / no contact pages | Check `max_pages_per_site` setting, check `extractor.py` patterns |
| "Database is locked" | SQLite concurrency under high load | SQLite WAL mode is enabled, but heavy concurrency can still cause this |
| Browser crashes | Out of memory on VM | Check `free -h`, reduce `maps_concurrency` or `browser_concurrency` |
| Task timeout (40 min) | VM crawler job too slow | Increase `job_timeout_s`, reduce `searchDepth`, increase VM size |
| Leads show but no emails | Email guessing failed / all invalid | Check AI filter settings, WHOIS lookup, SMTP verification |

### 14.2 Diagnostic Commands

```bash
# Check VM health
ssh -i key.pem azureuser@20.240.52.137 "curl -s http://localhost:8000/health"

# Check crawler jobs
ssh -i key.pem azureuser@20.240.52.137 \
  "curl -s -H 'X-API-Key: KEY' 'http://localhost:8000/api/jobs?limit=5'"

# Check specific job
ssh -i key.pem azureuser@20.240.52.137 \
  "curl -s -H 'X-API-Key: KEY' 'http://localhost:8000/api/jobs/40'"

# Check VM resource usage
ssh -i key.pem azureuser@20.240.52.137 "uptime; free -h; nproc; ps aux --sort=-%cpu | head -10"

# Check Heroku task status
curl -s -H "Authorization: Bearer TOKEN" \
  "https://geolead-ai-api.herokuapp.com/api/tasks/{task-id}"

# Check Heroku logs
heroku logs --tail -a geolead-ai-api | grep "Processor\|CrawlerClient"

# Check tunnel is working
curl -s "https://xxx.trycloudflare.com/health"

# Test crawler API through tunnel
curl -s -H "X-API-Key: KEY" "https://xxx.trycloudflare.com/api/jobs/40"
```

### 14.3 Task Status Meanings

| Status | Meaning |
|--------|---------|
| `PENDING` | Task created, waiting in queue |
| `PROCESSING` | Task actively running (crawling + enrichment) |
| `COMPLETED` | All phases done, leads available |
| `FAILED` | Fatal error (crawler offline, etc.) |
| `CANCELLED` | User cancelled |
| `PAUSED` | User paused |

### 14.4 Crawler Job Status Meanings

| Status | Meaning |
|--------|---------|
| `pending` | Waiting for global job slot |
| `running` | Actively scraping Google Maps + crawling sites |
| `paused` | User paused via API |
| `completed` | All URLs processed, results ready to fetch |
| `stopped` | User stopped via API (partial results may exist) |
| `failed` | Error occurred |

---

## Appendix A: Data Flow Diagram (Simplified)

```
User clicks "Search"
        │
        ▼
POST /api/search (Heroku)
        │
        ▼
Create SearchTask (PostgreSQL)
        │
        ▼
startSearchTaskProcessing()
        │
        ▼
buildSearchQueries() → up to 10 queries
        │
        ▼
[Loop over queries]
    │
    ├── searchAndCrawl()
    │       │
    │       ├── GET /health (VM)
    │       ├── POST /api/search (VM) → creates SearchJob in SQLite
    │       ├── run_search_job() (VM background thread)
    │       │       │
    │       │       ├── gmaps.search_places() [browser: scroll Maps results]
    │       │       ├── gmaps.place_details() [browser: per-place page]
    │       │       ├── _crawl_site() [HTTP: fetch website]
    │       │       ├── extractor [emails, phones, socials]
    │       │       ├── accuracy / kimi [relevance scoring]
    │       │       └── _persist() [save to SQLite]
    │       │
    │       ├── pollJob() [every 3s until completed/timeout]
    │       └── fetchResults() [paginated GET]
    │
    └── Deduplicate & filter results
        │
        ▼
[After all queries]
    │
    ├── Sort by score, trim to searchDepth
    ├── [For each business]
    │       ├── crawlWebsite()
    │       ├── validate emails
    │       ├── email guessing (if needed)
    │       ├── reverse WHOIS (if needed)
    │       ├── email verification (SMTP/MX)
    │       ├── AI scoring (match, DM, intent, fit, quality)
    │       └── Create Lead + LeadEmail records
    │
    └── Set task COMPLETED
```

---

## Appendix B: Heroku Backend Task Progress Mapping

| Progress Range | Phase | Description |
|---------------|-------|-------------|
| 0-4% | Initial | Task created |
| 5% | Starting | Processor started |
| 10% | Ready | Queries generated |
| 10-29% | Crawling | Crawler queries running (each query contributes) |
| 30% | Processing | All crawler results collected, enrichment begins |
| 30-95% | Enriching | Per-business enrichment (scoring, verification) |
| 100% | Complete | Task finished |

---

## Appendix C: Key Relationships

```
Heroku SearchTask (1) ──< Lead (many)
                              │
                              └──< LeadEmail (many)

VM SearchJob (1) ──< Website (many)
                          │
                          └──< Contact (many)

Heroku SearchTask.metadata.crawlerJobId ──→ VM SearchJob.id
```

---

*End of document. Generated from codebase analysis on 2026-06-29.*
