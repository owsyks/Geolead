# GeoLead Crawler — Complete Technical Documentation

## Overview

The GeoLead Crawler is a **self-hosted Python FastAPI application** that replaces Serper.dev as GeoLead AI's lead discovery engine. It performs **multi-engine search**, **stealth browser crawling**, **contact extraction**, and **AI-powered relevance scoring** — all without any paid API keys.

---

## Architecture

```
GeoLead AI (Heroku)                    Crawler (Your PC/VPS)
┌─────────────────┐                   ┌──────────────────────────┐
│  Next.js UI     │                   │  FastAPI (port 8000)     │
│  Express API    │                   │  ├── Search engine       │
│  BullMQ worker  │                   │  ├── Stealth browser     │
│  PostgreSQL     │                   │  ├── Contact extractor   │
│  Redis          │                   │  ├── Proxy pool          │
└────────┬────────┘                   │  ├── Kimi AI scorer      │
         │                            │  └── SQLite database     │
         │  POST /api/search          │                          │
         │  ────────────────────────► │  (background crawl job)  │
         │  GET /api/jobs/{id} (poll) │                          │
         │  ◄── status: running ────  │  Stealth browser search  │
         │  GET /api/jobs/{id}        │  + website crawling      │
         │  ◄── status: completed ──  │  + email/phone extraction│
         │  GET /api/searches/{id}/results                  │
         │  ◄── [businesses+contacts] ──────────────────────┘
         │                            │
         │  POST /api/jobs/{id}/stop  │  (kills running job)     │
         │  ────────────────────────► │                          │
┌────────┴────────┐                   └──────────────────────────┘
│  Lead records    │
│  Intelligence    │   ← GeoLead runs its own pipeline on the results:
│  DM discovery    │     email verification, decision maker discovery,
│  Buyer intent    │     buyer intent scoring, domain fit, AI enrichment
│  Campaigns       │
└─────────────────┘
```

### Connection Path

```
Heroku (GeoLead API)
    ↓ HTTPS
Cloudflare Tunnel (trycloudflare.com)
    ↓ HTTP (localhost)
FastAPI Crawler (127.0.0.1:8000)
```

The crawler binds to `127.0.0.1` only — never directly exposed. A **Cloudflare Tunnel** provides public HTTPS access with auto-TLS.

---

## Technology Stack

| Component | Technology |
|---|---|
| Web framework | FastAPI 0.115 + Uvicorn |
| Database | SQLite (WAL mode, thread-safe) |
| ORM | SQLAlchemy 2.0 |
| HTML parsing | BeautifulSoup4 + lxml |
| Stealth browser | Scrapling (Playwright/Chromium) |
| TLS fingerprinting | curl_cffi (JA3 spoofing) |
| AI scoring | NVIDIA NIM (Kimi K2.6) — optional |
| Proxy rotation | Custom ProxyPool with health tracking |
| API auth | X-API-Key header middleware |
| Deployment | Docker / docker-compose / direct Python |

---

## Search Engine

The crawler uses a **multi-engine stealth search** strategy — no paid API keys required.

### Search Providers (in `app/crawler/search.py`)

| Provider | Type | Key Required | Anti-Bot Bypass |
|---|---|---|---|
| **Stealth (default)** | Browser-rendered | No | Yes (Chromium) |
| DuckDuckGo HTML | HTTP | No | No |
| Mojeek | HTTP | No | No |
| SerpAPI | API | Yes | N/A (dormant) |
| Serper.dev | API | Yes | N/A (dormant) |

### Stealth Search Flow

When `SEARCH_PROVIDER=stealth` (default), the crawler renders SERPs (Search Engine Result Pages) using a **real stealth Chromium browser** that solves Cloudflare challenges and anti-bot checks:

```
1. Build search URLs for 6 engines:
   - DuckDuckGo HTML   (html.duckduckgo.com/html/?q=…)
   - Bing              (bing.com/search?q=…&first=…&count=50)
   - Mojeek            (mojeek.com/search?q=…&s=…)
   - Yahoo             (search.yahoo.com/search?p=…&b=…)
   - Brave             (search.brave.com/search?q=…&offset=…)
   - Startpage         (startpage.com/sp/search?q=…&page=…)

2. Fetch each SERP via StealthyFetcher (stealth Chromium)
   - Renders JavaScript
   - Solves Cloudflare challenges on demand
   - Rotates User-Agent per request
   - Uses proxy if available

3. Parse each rendered HTML page
   - Extract all <a href> URLs
   - Filter out search-engine self-links, social media, directories
   - Deduplicate by domain (one result per domain)

4. Fallback: if browser engines yield nothing,
   fall back to plain HTTP keyless providers (Mojeek, DuckDuckGo)
```

### Search Source Modes

The `source` parameter controls which search verticals are used:

| Source | What it does |
|---|---|
| `web` | Search engines only (DuckDuckGo, Bing, Mojeek, Yahoo, Brave, Startpage) |
| `google_maps` | Google Maps business listings only (stealth browser renders Maps) |
| `combined` | Both web + Maps (50/50 split of max_results) |

---

## Crawling Pipeline

Once search returns a list of URLs, the crawler visits each one to extract contact information.

### Fetcher Chain (in `app/crawler/fetcher.py`)

Each URL is fetched with a **4-level fallback chain**:

```
1. StealthyFetcher  — stealth Chromium with anti-bot evasion + CF solving
2. Static Fetcher   — curl_cffi with TLS fingerprint impersonation (JA3 spoofing)
3. DynamicFetcher   — plain Chromium (renders JS, no stealth)
4. requests         — fast static HTTP fallback
```

Each level is tried in order. If one fails (timeout, 403, empty response), the next is attempted. Once a fetcher fails permanently, it's flagged to skip future attempts.

### Per-Site Crawl Depth

For each discovered website, the crawler:

1. **Fetches the landing page** — extracts title, company name, all text
2. **Finds inner pages** by scanning links for contact-related keywords:
   - Contact pages: `/contact`, `/kontakt`, `/contacto`, `/get-in-touch`
   - About pages: `/about`, `/about-us`, `/company`, `/uber-uns`
   - Deep crawl (extra): `/team`, `/staff`, `/leadership`, `/imprint`, `/legal`, `/support`, `/locations`
3. **Visits up to 8 pages** per site (`MAX_PAGES_PER_SITE=8`)
4. **Extracts contacts** from every visited page

### Contact Extraction (in `app/crawler/extractor.py`)

| Contact Type | How it's found |
|---|---|
| **Email** | Regex on raw HTML + visible text. Filters out image/CSS/JS file extensions. Also decodes Cloudflare email protection (XOR-encoded `data-cfemail` attributes). |
| **Phone** | Regex with separator requirement (avoids matching ID/price/date numbers). Only trusted if it has a country code (`+`/`00`), parenthesized area code, or leading `0`. |
| **Social links** | Scans `<a>` tags for LinkedIn, Facebook, Instagram, Twitter/X, YouTube URLs |
| **Contact forms** | Detects `<form>` elements with contact-related action URLs or input fields |

### Relevance Scoring (in `app/crawler/accuracy.py`)

Each crawled site gets a **0.0–1.0 relevance score**:

1. **Heuristic score** (always runs):
   - Extracts keyword tokens (drops stopwords like "the", "and", "services")
   - Checks what fraction of keyword tokens appear in domain, title, and page text
   - Geographic tokens get extra weight

2. **Kimi AI score** (optional, if `KIMI_ENABLED=true`):
   - Sends page text + keyword to NVIDIA NIM (Kimi K2.6)
   - Gets a semantic relevance score + extracted company name
   - Blended: `final = kimi_score * 0.70 + heuristic * 0.30`

3. **Aggregator filtering**:
   - 50+ known directory/review sites are filtered out (Yelp, TripAdvisor, YellowPages, Facebook, LinkedIn, etc.)
   - Ensures results are actual businesses, not listing pages

---

## Google Maps Discovery (in `app/crawler/gmaps.py`)

When `source=google_maps` or `combined`:

```
1. Open Google Maps search URL in stealth Chromium
   - https://www.google.com/maps/search/keyword
   - Dismiss EU cookie consent wall if detected

2. Scroll the results feed to load many businesses
   - Collects business name + place URL for each

3. For each business, open the place detail panel:
   - Extract website URL (data-item-id="authority")
   - Extract phone number (data-item-id="phone")
   - Extract address (data-item-id="address")

4. If the business has a website → crawl it with the normal pipeline
5. If no website → still save as a lead (name + phone + address from Maps)
```

Maps results get `relevance=1.0` (keyword-accurate by construction) and `source="google_maps"`.

---

## Proxy System

### Free Proxy Auto-Harvest (in `app/crawler/proxy_sources.py`)

No paid proxy service required. The crawler auto-harvests free proxies from 6 sources:

| Source | URL |
|---|---|
| ProxyScrape Free | `api.proxyscrape.com/v4/free-proxy-list/get` |
| Geonode | `proxylist.geonode.com/api/proxy-list` |
| ProxyListDownload | `proxyscrape.com/proxylist/download` |
| OpenProxyList | `openproxylist.xyz` |
| GitHub SpeedX | `raw.githubusercontent.com/.../speedx.json` |
| GitHub MonoSans | `raw.githubusercontent.com/.../proxies.json` |

### Proxy Pool (in `app/crawler/proxy.py`)

The `ProxyPool` class provides:

- **Health tracking**: Each proxy gets a latency score + success/fail count
- **Sticky-per-domain**: Same proxy reused for the same domain (avoids IP rotation detection)
- **Cooldown**: Failed proxies are excluded for 90 seconds
- **Max consecutive fails**: 3 failures → proxy removed from pool
- **Auto-refill**: Pool refills when live count drops below `PROXY_REFILL_THRESHOLD` (8)
- **Validation**: 50 parallel workers test proxies against `api.ipify.org`
- **Protocols**: HTTP, HTTPS, SOCKS4, SOCKS5

### Per-Job Proxy Control

Each search job can independently:
- Enable/disable free proxy auto-harvest (`proxyscrape_enabled`)
- Provide manual proxy list (`proxies` field, newline-separated)
- Manual proxies are validated before use and added to the pool immediately

---

## Kimi AI Integration (in `app/crawler/kimi.py`)

Optional AI-powered enrichment via NVIDIA NIM (Kimi K2.6):

| Function | What it does |
|---|---|
| `evaluate_site_fit()` | Semantic relevance scoring — is this site actually about the keyword? |
| `extract_company_name()` | Clean company name extraction from messy HTML |
| `chat()` | Generic chat-completions for custom prompts |

**Configuration:**
```env
KIMI_ENABLED=true
KIMI_API_KEY=nvapi-...
KIMI_API_BASE=https://integrate.api.nvidia.com/v1
KIMI_MODEL=moonshotai/kimi-k2.6
```

When disabled, the crawler falls back to heuristic-only scoring.

---

## API Reference

Base URL: `http://localhost:8000` (or your Cloudflare Tunnel URL)
Auth: `X-API-Key` header (when `API_KEY` is set in `.env`)

### Search Jobs

#### `POST /api/search`
Start a new search + crawl job (runs in background).

```json
{
  "keyword": "marketing agencies Indianapolis",
  "max_results": 20,
  "region": "us-en",
  "source": "combined",
  "emails_only": false,
  "proxyscrape_enabled": true,
  "aggressive_mode": false
}
```

Response:
```json
{
  "id": 16,
  "keyword": "marketing agencies Indianapolis",
  "status": "pending",
  "total_urls": 0,
  "processed_urls": 0,
  "contacts_found": 0
}
```

#### `GET /api/jobs/{job_id}`
Poll job status.

```json
{
  "id": 16,
  "status": "running",
  "total_urls": 20,
  "processed_urls": 12,
  "contacts_found": 47
}
```

Status values: `pending` → `running` → `completed` | `failed` | `stopped` | `paused`

#### `GET /api/jobs?limit=20`
List recent jobs.

#### `POST /api/jobs/{job_id}/pause`
Pause a running job.

#### `POST /api/jobs/{job_id}/resume`
Resume a paused job.

#### `POST /api/jobs/{job_id}/stop`
Stop a running/paused job — kills all browser processes for that job.

### Results

#### `GET /api/searches/{job_id}/results`
Paginated results with contacts grouped by type.

```json
{
  "total": 20,
  "page": 1,
  "pages": 1,
  "items": [
    {
      "id": 42,
      "domain": "example-agency.com",
      "url": "https://example-agency.com",
      "title": "Example Marketing Agency",
      "company_name": "Example Marketing Agency LLC",
      "address": "123 Main St, Indianapolis, IN",
      "contact_page": "https://example-agency.com/contact",
      "source": "google_maps",
      "relevance": 0.92,
      "emails": [{"value": "hello@example-agency.com", "source_url": "https://example-agency.com/contact"}],
      "phones": [{"value": "+1 317-555-0100", "source_url": "https://example-agency.com"}],
      "socials": [{"value": "https://linkedin.com/company/example", "platform": "linkedin", "source_url": "https://example-agency.com"}],
      "contact_forms": [{"value": "https://example-agency.com/contact#form", "source_url": "https://example-agency.com/contact"}]
    }
  ]
}
```

Query params: `page`, `page_size`, `has_email`, `has_phone`, `has_social`, `q` (search text), `min_relevance`

#### `GET /api/search-web`
Lightweight search (URLs only, no crawl). Used by GeoLead for LinkedIn verification.

```
GET /api/search-web?q=John Smith CEO Example Corp linkedin&max_results=10
```

```json
{
  "results": [
    {"url": "https://linkedin.com/in/johnsmith", "title": "", "snippet": ""}
  ]
}
```

### Stats

#### `GET /api/stats`
```json
{
  "total_sites": 142,
  "total_contacts": 380,
  "total_emails": 210,
  "total_phones": 95,
  "total_searches": 16
}
```

### Export

#### `GET /api/export/{fmt}`
Format: `csv`, `txt`, or `json`. Accepts same filter params as results endpoint.

### Health

#### `GET /health`
```json
{"status": "ok", "app": "Business Contact Discovery Platform"}
```

---

## Database Schema (SQLite)

### `search_jobs`
| Column | Type | Description |
|---|---|---|
| id | INTEGER PK | Auto-increment |
| keyword | VARCHAR(255) | Search keyword |
| region | VARCHAR(32) | e.g. "us-en" |
| max_results | INTEGER | Target result count |
| source | VARCHAR(32) | `web` / `google_maps` / `combined` |
| status | VARCHAR(32) | `pending` / `running` / `completed` / `failed` / `stopped` / `paused` |
| total_urls | INTEGER | URLs discovered by search |
| processed_urls | INTEGER | URLs crawled so far |
| contacts_found | INTEGER | Total contacts extracted |
| emails_only | INTEGER | 1 = only keep sites with emails |
| proxies | TEXT | Manual proxy list |
| proxyscrape_enabled | INTEGER | 1 = auto-harvest free proxies |
| aggressive_mode | INTEGER | 1 = bypass robots.txt, minimal delay |
| error | TEXT | Error message if failed |
| created_at | DATETIME | |
| finished_at | DATETIME | |

### `websites`
| Column | Type | Description |
|---|---|---|
| id | INTEGER PK | |
| domain | VARCHAR(255) UNIQUE | e.g. "example-agency.com" |
| url | VARCHAR(1024) | Full URL |
| title | VARCHAR(512) | Page `<title>` |
| company_name | VARCHAR(512) | Extracted company name |
| contact_page | VARCHAR(1024) | Contact page URL |
| address | VARCHAR(512) | Business address (from Maps) |
| keyword | VARCHAR(255) | Keyword that found this site |
| job_id | INTEGER FK | Search job that discovered it |
| source | VARCHAR(32) | `web` / `google_maps` |
| relevance | FLOAT | 0.0–1.0 keyword match score |
| scanned_at | DATETIME | |

### `contacts`
| Column | Type | Description |
|---|---|---|
| id | INTEGER PK | |
| website_id | INTEGER FK | → websites.id (CASCADE) |
| contact_type | VARCHAR(32) | `email` / `phone` / `contact_form` / `linkedin` / `facebook` / `instagram` / `twitter` / `youtube` |
| contact_value | VARCHAR(1024) | The actual email/phone/URL |
| source_url | VARCHAR(1024) | Page where it was found |
| discovered_at | DATETIME | |

**Unique constraint**: `(website_id, contact_type, contact_value)` — no duplicates.

---

## Configuration (.env)

### Core

| Variable | Default | Description |
|---|---|---|
| `APP_NAME` | Business Contact Discovery Platform | Display name |
| `HOST` | 0.0.0.0 | Bind address (use 127.0.0.1 for security) |
| `PORT` | 8000 | Listen port |
| `DATABASE_URL` | sqlite:///./data/contacts.db | SQLite path |
| `API_KEY` | (empty) | X-API-Key auth. **Always set on public VPS.** |

### Search

| Variable | Default | Description |
|---|---|---|
| `SEARCH_PROVIDER` | stealth | `stealth` / `mojeek` / `duckduckgo` |
| `SEARCH_API_KEY` | (empty) | Only for paid providers (dormant) |
| `SEARCH_SOURCE` | web | Default source mode |
| `MAX_RESULTS` | 1000 | Hard cap per job |

### Stealth Browser

| Variable | Default | Description |
|---|---|---|
| `USE_SCRAPLING` | true | Use Scrapling fetchers at all |
| `USE_STEALTH` | true | StealthyFetcher (anti-bot Chromium) |
| `SOLVE_CLOUDFLARE` | false | Auto-solve CF challenges |
| `HEADLESS` | true | Run browser hidden |
| `REAL_CHROME` | false | Use installed Chrome instead of bundled |
| `BLOCK_RESOURCES` | true | Skip images/fonts/CSS for speed |
| `STEALTH_TIMEOUT_MS` | 35000 | Per-page browser timeout |
| `BROWSER_CONCURRENCY` | 3 | Concurrent browser instances |

### Crawl Depth

| Variable | Default | Description |
|---|---|---|
| `MAX_PAGES_PER_SITE` | 8 | Pages to visit per site |
| `DEEP_CRAWL` | true | Follow extra internal link types |
| `RESPECT_ROBOTS` | true | Honor robots.txt |

### Google Maps

| Variable | Default | Description |
|---|---|---|
| `MAPS_TIMEOUT_MS` | 90000 | Maps pages are heavy |
| `MAPS_CONCURRENCY` | 2 | Concurrent place-detail browsers |

### Proxy

| Variable | Default | Description |
|---|---|---|
| `FREE_PROXY_ENABLED` | true | Auto-harvest free proxies |
| `PROXY_SOURCES` | (6 sources) | Comma-separated harvest sources |
| `PROXY_PROTOCOLS` | http,https,socks4,socks5 | Allowed protocols |
| `PROXY_VALIDATION_WORKERS` | 50 | Parallel validation threads |
| `PROXY_VALIDATE_TIMEOUT` | 5 | Seconds per validation |
| `PROXY_MIN_POOL` | 25 | Minimum healthy proxies to maintain |
| `PROXY_REFILL_THRESHOLD` | 8 | Refill when live count drops below this |
| `PROXY_MAX_HARVEST` | 500 | Max proxies to harvest per cycle |
| `PROXY_FAIL_COOLDOWN` | 90 | Seconds to exclude failed proxy |
| `PROXY_MAX_CONSECUTIVE_FAILS` | 3 | Fails before removal |
| `PROXY_STICKY_PER_DOMAIN` | true | Reuse same proxy per domain |

### Identity Rotation

| Variable | Default | Description |
|---|---|---|
| `UA_ROTATION` | true | Rotate User-Agent strings |

### Aggressive Mode

| Variable | Default | Description |
|---|---|---|
| `AGGRESSIVE_MODE` | false | Bypass robots.txt, minimal delay, extra workers |
| `AGGRESSIVE_DELAY` | 0.0 | No delay between requests |
| `AGGRESSIVE_MAX_RETRIES` | 4 | More retries |
| `AGGRESSIVE_EXTRA_WORKERS` | 4 | More concurrent workers |

### Low-CPU Mode

| Variable | Default | Description |
|---|---|---|
| `LOW_CPU` | false | Disables Chromium, lowers concurrency, uses plain HTTP |

When `LOW_CPU=true`:
- `USE_SCRAPLING=false`, `USE_STEALTH=false`
- `SEARCH_PROVIDER=duckduckgo`
- `MAX_CONCURRENCY=2`, `BROWSER_CONCURRENCY=1`
- `MAX_PAGES_PER_SITE=2`, `DEEP_CRAWL=false`
- `MAX_RESULTS=100`, `REQUEST_DELAY=2.0`

### Kimi AI

| Variable | Default | Description |
|---|---|---|
| `KIMI_ENABLED` | false | Enable AI scoring |
| `KIMI_API_KEY` | (empty) | NVIDIA NIM API key |
| `KIMI_API_BASE` | https://integrate.api.nvidia.com/v1 | |
| `KIMI_MODEL` | moonshotai/kimi-k2.6 | |
| `KIMI_MAX_TOKENS` | 16384 | |
| `KIMI_TEMPERATURE` | 1.0 | |
| `KIMI_TIMEOUT` | 60 | Seconds |

---

## Deployment

### Option 1: Direct Python (Local PC)

```bash
cd ~/Desktop/crawl

# Create venv
python -m venv .venv
.venv\Scripts\activate    # Windows
# source .venv/bin/activate  # Linux/Mac

# Install deps
pip install -r requirements.txt
python -m playwright install chromium

# Configure
cp .env.example .env
# Edit .env: set API_KEY, SEARCH_PROVIDER, etc.

# Run
python -m uvicorn app.main:app --host 127.0.0.1 --port 8000
```

### Option 2: Docker (VPS)

```bash
cd ~/crawl
docker compose up -d --build
```

`docker-compose.yml`:
```yaml
services:
  app:
    build: .
    container_name: contact-discovery
    ports:
      - "8000:8000"
    env_file:
      - .env
    volumes:
      - ./data:/app/data    # persist SQLite
    restart: unless-stopped
```

### Option 3: Cloudflare Tunnel (Public Access)

For exposing the local crawler to Heroku/Vercel without a VPS:

```bash
# Install cloudflared
# Download from: https://github.com/cloudflare/cloudflared/releases

# Start tunnel
cloudflared tunnel --url http://127.0.0.1:8000
```

Output:
```
https://locking-scanned-colours-ben.trycloudflare.com
```

Set this URL as `CRAWLER_BASE_URL` on Heroku.

**Note:** trycloudflare URLs are ephemeral — they change when cloudflared restarts. For a permanent URL, create a named tunnel with a Cloudflare account.

### One-Click Start Script

`start-server.bat` (Windows):
```batch
@echo off
cd /d "%~dp0"
echo Starting crawler...
.venv\Scripts\python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 8000
timeout /t 5 /nobreak >nul
echo Starting Cloudflare Tunnel...
"%LOCALAPPDATA%\Programs\cloudflared\cloudflared.exe" tunnel --url http://127.0.0.1:8000
```

---

## Security

### API Key Authentication

All `/api/*` endpoints require the `X-API-Key` header when `API_KEY` is set in `.env`:

```python
# auth.py — Starlette middleware
if settings.api_key:
    provided = request.headers.get("X-API-Key") or request.query_params.get("api_key")
    if not provided or not hmac.compare_digest(str(provided), settings.api_key):
        return JSONResponse(status_code=401, content={"detail": "Invalid or missing API key"})
```

HTML pages (`/`, `/dashboard`) and static assets are **not** gated (same-origin).

### Network Security

| Layer | Protection |
|---|---|
| Application | API key (HMAC-compared, timing-safe) |
| Transport | Cloudflare Tunnel (auto-TLS, HTTPS) |
| Network | Crawler binds to `127.0.0.1` only — not directly exposed |
| Rate limiting | Not built-in (GeoLead handles rate limiting via BullMQ queues) |

### Generating a Strong API Key

```bash
python -c "import secrets; print(secrets.token_urlsafe(32))"
```

---

## GeoLead Integration

### How GeoLead Calls the Crawler

**File:** `backend/src/services/crawlerClient.ts`

| Function | Crawler Endpoint | Purpose |
|---|---|---|
| `searchAndCrawl()` | `POST /api/search` + poll + `GET /api/searches/{id}/results` | Full lead discovery (search + crawl + contacts) |
| `searchWeb()` | `GET /api/search-web` | LinkedIn profile verification |
| `searchMaps()` | `POST /api/search` with `source=google_maps` | Domain intelligence (buyer pool) |
| `stopCrawlerJob()` | `POST /api/jobs/{id}/stop` | Kill a running VPS job (Stop button) |
| `stopAllCrawlerJobs()` | `GET /api/jobs` + `POST /api/jobs/{id}/stop` for each running | Cleanup on startup / panic button |

### Data Flow: Search → Leads

```
1. User enters: keyword="marketing agencies", cityState="Indianapolis"
   ↓
2. GeoLead builds query: "marketing agencies Indianapolis"
   ↓
3. crawlerClient.searchAndCrawl() → POST /api/search on VPS
   ↓
4. Crawler starts background job:
   a. Stealth browser searches 6 engines + Google Maps
   b. Finds ~20 business URLs
   c. Crawls each website (up to 8 pages each)
   d. Extracts emails, phones, socials, contact forms
   e. Scores relevance (heuristic + optional Kimi AI)
   ↓
5. GeoLead polls GET /api/jobs/{id} every 3 seconds
   - Updates progress in DB (10% → 30%)
   - Checks shouldCancel() — if user clicked Stop, kills VPS job
   - Retries on 502/504 tunnel errors
   ↓
6. Crawler job completes → GeoLead fetches GET /api/searches/{id}/results
   ↓
7. GeoLead creates Lead records in PostgreSQL:
   - businessName, website, location, phoneNumbers, socialLinks
   - Runs validateAndCleanEmails() → SMTP verification
   - Runs crawlWebsite() for companySize + pageText
   - Runs intelligence pipeline:
     • discoverDecisionMaker() — CEO/Founder name + role
     • analyzeBuyerIntent() — 0-100 buyer intent score
     • scoreDomainFit() — 0-100 domain upgrade fit
     • scoreBusinessQuality() — 0-100 quality score
     • verifyDecisionMakerViaLinkedIn() — LinkedIn profile URL
     • AI enrichment (company description, pain points)
   ↓
8. Leads appear in dashboard with full intelligence data
```

### Stop/Cancel Flow

```
1. User clicks "Stop" in dashboard
   ↓
2. Frontend: PATCH /api/tasks/{id}/status { status: "CANCELLED" }
   ↓
3. Backend reads task.metadata.crawlerJobId
   ↓
4. stopCrawlerJob(jobId) → POST /api/jobs/{id}/stop on VPS
   → Crawler kills all browser processes for that job
   ↓
5. pollJob() shouldCancel() returns true → stops polling
   ↓
6. Task marked CANCELLED, 0 leads saved
```

### Settings (GeoLead DB)

| Setting Key | Description |
|---|---|
| `crawlerBaseUrl` | Crawler URL (e.g. `https://xxx.trycloudflare.com`) |
| `crawlerApiKey` | X-API-Key value (matches crawler's `API_KEY`) |

These can be set via the Settings page or environment variables (`CRAWLER_BASE_URL`, `CRAWLER_API_KEY`).

---

## Resource Requirements

| Mode | RAM | CPU | Use Case |
|---|---|---|---|
| Low-CPU | 512MB | 1 vCPU | Background batch, no browser |
| Normal | 2GB | 2 vCPU | Stealth browser, 3 concurrent |
| Aggressive | 4GB | 4 vCPU | High-volume scraping |

**Browser memory:** Each stealth Chromium instance uses ~300-500MB. Default `BROWSER_CONCURRENCY=3` → ~1.5GB for browsers alone.

---

## File Structure

```
crawl/
├── app/
│   ├── main.py              # FastAPI app entry point
│   ├── config.py            # Settings (env vars → Settings object)
│   ├── auth.py              # API key middleware
│   ├── database.py          # SQLAlchemy engine + session
│   ├── models.py            # ORM models (Website, Contact, SearchJob)
│   ├── schemas.py           # Pydantic request/response schemas
│   ├── routes.py            # All API endpoints
│   ├── export.py            # CSV/TXT/JSON export logic
│   └── crawler/
│       ├── __init__.py
│       ├── engine.py        # Main crawl engine (run_search_job, _crawl_site)
│       ├── search.py        # Multi-engine search providers
│       ├── fetcher.py       # 4-level fetch chain (stealth → curl → dynamic → requests)
│       ├── extractor.py     # Contact extraction (emails, phones, socials, forms)
│       ├── gmaps.py         # Google Maps business discovery
│       ├── accuracy.py      # Relevance scoring + aggregator filtering
│       ├── kimi.py          # NVIDIA NIM (Kimi K2.6) AI client
│       ├── proxy.py         # ProxyPool with health tracking
│       ├── proxy_sources.py # Free proxy auto-harvest (6 sources)
│       └── robots.py        # robots.txt cache
├── data/
│   └── contacts.db          # SQLite database
├── .env                     # Configuration
├── .env.example             # Configuration template
├── requirements.txt         # Python dependencies
├── Dockerfile               # Container definition
├── docker-compose.yml       # Container orchestration
├── start.bat                # Windows start script (direct Python)
├── start-server.bat         # Windows start script (Python + Cloudflare Tunnel)
├── API.md                   # API documentation
├── INSTALL.md               # Installation guide
└── README.md                # Project overview
```

---

## Limitations & Trade-offs

| Aspect | Serper.dev (old) | Custom Crawler (new) |
|---|---|---|
| **Cost** | $50/mo (250K searches) | $0 (free) |
| **Speed** | 1-3s per search | 2-15min per search (stealth browser) |
| **Search engines** | Google only | 6 engines + Google Maps |
| **Anti-bot bypass** | No (API-based) | Yes (stealth Chromium) |
| **Proxy support** | No | Yes (free auto-harvest) |
| **Email extraction** | No (GeoLead did it) | Yes (built-in) |
| **Relevance scoring** | No | Heuristic + AI |
| **Rate limits** | API quota | None (self-hosted) |
| **Dependencies** | None | Playwright/Chromium (~300MB) |
| **Reliability** | High (managed API) | Medium (browser can fail, proxies can die) |
| **Tunnel stability** | N/A | Cloudflare Tunnel can 502 (retry logic handles this) |

---

## Troubleshooting

### Crawler not starting
- Check Python venv exists: `.venv\Scripts\python.exe`
- Check `.env` file exists
- Run in foreground to see errors: `python -m uvicorn app.main:app --host 127.0.0.1 --port 8000`

### No search results
- Check `SEARCH_PROVIDER=stealth` in `.env`
- Check Playwright Chromium is installed: `python -m playwright install chromium`
- Try `LOW_CPU=true` mode (uses DuckDuckGo HTTP instead of browser)
- Check crawler logs for errors

### Tunnel URL changed
- Cloudflare trycloudflare URLs are ephemeral — they change on restart
- Get new URL from cloudflared output
- Update on Heroku: `heroku config:set CRAWLER_BASE_URL=https://new-url.trycloudflare.com --app geolead-ai-api`

### 502 Bad Gateway errors
- GeoLead's `pollJob()` now retries on 502/504 automatically
- If persistent, the tunnel may be down — check cloudflared process
- Consider using a named Cloudflare tunnel for stability

### Browser crashes (EPIPE)
- Can happen when proxy connection drops mid-request
- Crawler auto-retries with fallback fetchers
- If frequent, reduce `BROWSER_CONCURRENCY` to 1-2

### Database locked
- SQLite WAL mode + busy_timeout=5000 handles concurrent access
- If persistent, switch to PostgreSQL by changing `DATABASE_URL`

---

## Future Improvements

1. **Named Cloudflare Tunnel** — permanent URL instead of ephemeral trycloudflare
2. **PostgreSQL support** — for multi-instance deployment
3. **Redis job queue** — for distributed crawling across multiple VPS instances
4. **API rate limiting** — built-in rate limiter for multi-tenant use
5. **Webhook callback** — crawler calls GeoLead when job completes (instead of polling)
6. **Headless Chrome pooling** — reuse browser instances across jobs for faster startup
