# GeoLead AI

AI-powered lead generation platform for geo-domain sellers. Discovers local businesses, extracts contact info, enriches with AI intelligence, and powers outbound email campaigns.

## How It Works

1. **Search** — you enter a keyword + city (e.g. "handyman Seattle, WA") with search depth (10–200)
2. **Auto-expand** — the system generates related searches: multi-keyword expansion (handyman → contractor, home repair, remodeling), multi-region expansion (Seattle → Bellevue, Redmond, Kirkland), and runs them all in parallel
3. **Crawl** — each search feeds the Python crawler (on Azure VM) which scrapes Google Maps + web for businesses and their contact info
4. **Enrich** — for each discovered business:
   - Crawls their website for emails, phones, socials
   - **Email guessing** — if no emails found on site, generates common patterns (info@, contact@, firstname@) and SMTP-verifies them
   - **Reverse whois** — as final fallback, queries WHOIS API for domain registrant email
   - Sitemap crawling — fetches sitemap.xml for additional pages to crawl
   - AI email filtering (NVIDIA NIM) removes artifacts
   - SMTP verification confirms deliverability
   - Decision maker discovery, buyer intent scoring, domain fit scoring
5. **Outbound** — validated leads go into campaigns for cold email sequences with tracking, analytics, and AI reply suggestions

## New Features (v93)

| Feature | Description |
|---------|-------------|
| **Multi-keyword expansion** | Auto-expands "handyman" → "contractor", "home repair", "remodeling", etc. ~30 categories |
| **Multi-region expansion** | Auto-expands cities to nearby metro areas. 30+ metro maps (Seattle→Bellevue, Redmond, Kirkland...) |
| **Email guessing + SMTP** | Generates common patterns when no emails found, SMTP-verifies them, keeps only valid |
| **Reverse whois** | Queries WhoisXML or WhoisFreaks API for domain registrant email as final fallback |
| **Directory unblocking** | Directory pages (Yelp, YellowPages) with a business email are now kept as valid leads |
| **Sitemap crawling** | Fetches sitemap.xml and crawls URLs for deeper email extraction |
| **Depth scaling** | Higher search depths (200+) get 4x result multiplier for aggressive hunting |

## Tech Stack

- **Frontend**: Next.js (React, Tailwind, shadcn/ui)
- **Backend**: Express.js, Prisma (PostgreSQL), BullMQ (Redis)
- **Crawler**: Python (separate service on Azure VM)
- **AI**: NVIDIA NIM (Llama), OpenAI
- **Hosting**: Heroku (backend), Vercel (frontend)

## Setup

```bash
# Backend
cd backend
npm install
cp .env.example .env   # configure your env vars
npx prisma migrate dev
npm run dev

# Worker (in separate terminal)
cd backend
npm run dev:worker

# Frontend
cd frontend
npm install
cp .env.local.example .env.local
npm run dev
```

## Environment Variables

### Backend
| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | Yes | PostgreSQL connection string |
| `REDIS_URL` | Yes | Redis connection string (BullMQ) |
| `JWT_SECRET` | Yes | JWT signing secret |
| `SERPER_API_KEY` | Yes | Google Search API |
| `OPENAI_API_KEY` | For AI features | OpenAI API key |
| `OPENAI_MODEL` | No | Model name (default: gpt-4o) |
| `CRAWLER_BASE_URL` | Yes | Python crawler service URL |
| `CRAWLER_API_KEY` | Yes | Crawler API key |
| `ENRICH_CONCURRENCY` | No | Parallel enrichment (default: 3) |
| `MAX_CONCURRENT_SEARCHES` | No | Parallel searches (default: 2) |
| `WHOISXML_API_KEY` | No | WhoisXML API for reverse whois |
| `WHOISFREAKS_KEY` | No | WhoisFreaks API for reverse whois |

### Frontend
| Variable | Description |
|----------|-------------|
| `NEXT_PUBLIC_OUTBOUND_API_BASE` | Backend API URL |

## API Routes

### Search & Leads
- `POST /api/search` — start a lead search task
- `GET /api/tasks/:id` — poll task status & progress
- `GET /api/history` — search history
- `GET /api/leads` — list discovered leads
- `POST /api/leads/:id/notes` — add CRM note
- `POST /api/leads/:id/crm` — update CRM fields
- `GET /api/export` — export leads CSV

### Outbound Campaigns
- `GET|POST /api/outbound/campaigns` — list/create campaigns
- `GET|PATCH /api/outbound/campaigns/:id` — get/update campaign
- `PATCH /api/outbound/campaigns/:id/status` — pause/resume
- `POST /api/outbound/campaigns/:id/queue` — queue emails
- `GET|POST /api/outbound/templates` — template CRUD
- `GET|POST /api/outbound/senders` — sender account CRUD
- `POST /api/outbound/senders/:id/verify` — verify sender

### Inbox & Analytics
- `GET /api/outbound/inbox` — unified inbox
- `GET /api/outbound/inbox/:id/thread` — thread view
- `POST /api/outbound/inbox/:id/action` — reply/mark/archive
- `POST /api/outbound/inbox/:id/suggest` — AI reply suggestion
- `GET /api/outbound/analytics` — campaign analytics
- `GET /api/outbound/audit` — audit log

### AI
- `POST /api/outbound/generate` — AI email generation
- `POST /api/outbound/rewrite` — AI rewrite

## Deployment

```bash
# Backend to Heroku
git push heroku `git rev-parse HEAD`:main --force

# Frontend to Vercel
cd frontend && vercel --prod
```

## Architecture

```
User → Frontend (Next.js) → Backend API (Express)
                                ├── PostgreSQL (Prisma)
                                ├── Redis + BullMQ (queue)
                                ├── Python Crawler (Azure VM)
                                └── AI: NVIDIA NIM / OpenAI
```
