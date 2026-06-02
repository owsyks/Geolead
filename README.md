# GeoLead AI

GeoLead AI is an AI-powered outbound email automation platform for geo-domain sellers.

## What is included
- AI email generation with cold, follow-up, short, long, persuasive, and friendly variants
- Campaign creation, pause/resume, queueing, and compliant follow-up sequencing
- Unified inbox with reply classification and AI suggested responses
- Analytics with opens, clicks, replies, deliverability alerts, and send-time suggestions
- Lead explorer with CRM notes, tags, pipeline stages, and engagement tracking
- Sender account management with warm-up and deliverability fields
- Template library and reusable outbound copy
- Open, click, reply, bounce, and unsubscribe tracking
- WebSocket activity feed, audit logging, webhook monitoring, and suppression-list management
- Redis + BullMQ workers for scraping jobs and outbound queue processing

## Routes
- `/` overview
- `/dashboard` lead explorer
- `/lead-explorer` alias to lead explorer
- `/campaigns` campaign manager
- `/ai-email-generator` AI writer
- `/inbox` unified inbox
- `/analytics` analytics center
- `/sender-accounts` sender fleet
- `/templates` template library
- `/settings` integrations and compliance

## Backend API
The Express API exposes:
- `GET /api/health`
- `POST /api/search`
- `GET /api/tasks/:id`
- `GET /api/history`
- `GET /api/leads`
- `POST /api/leads/:id/notes`
- `GET /api/export`
- `GET /api/outbound/overview`
- `GET|POST /api/outbound/campaigns`
- `GET /api/outbound/campaigns/:id`
- `PATCH /api/outbound/campaigns/:id/status`
- `POST /api/outbound/campaigns/:id/queue`
- `GET|POST /api/outbound/templates`
- `GET|POST /api/outbound/senders`
- `POST /api/outbound/senders/:id/verify`
- `GET /api/outbound/inbox`
- `GET /api/outbound/inbox/:id/thread`
- `POST /api/outbound/inbox/:id/action`
- `POST /api/outbound/inbox/:id/suggest`
- `POST /api/outbound/replies`
- `GET /api/outbound/analytics`
- `GET /api/outbound/audit`
- `GET /api/outbound/webhooks`
- `GET|POST /api/outbound/suppressions`
- `POST /api/outbound/generate`
- `POST /api/outbound/rewrite`
- `PATCH /api/outbound/leads/:id/crm`
- `POST /api/outbound/webhooks/:provider`
- `GET /api/outbound/track/open/:trackingToken.gif`
- `GET /api/outbound/track/click/:trackingToken`
- `GET /api/outbound/unsubscribe/:unsubscribeToken`

## Local setup
1. Install dependencies:
   - `cd backend && npm install`
   - `cd ../frontend && npm install`
2. Configure env files:
   - `backend/.env`
   - `frontend/.env.local`
3. Run Prisma migrations:
   - `cd backend && npx prisma migrate dev`
4. Start the services:
   - `npm run dev:backend`
   - `npm run dev:worker`
   - `npm run dev:frontend`

The worker process handles both lead-scraping jobs and outbound send queue ticks.

Frontend runs on `http://localhost:3000`.
Backend runs on `http://localhost:5000`.

## Environment variables
Backend:
- `DATABASE_URL`
- `REDIS_URL`
- `SERPER_API_KEY`
- `OPENAI_API_KEY`
- `OPENAI_MODEL`
- `OUTBOUND_BASE_URL`
- `OUTBOUND_ADMIN_EMAIL`
- `OUTBOUND_PHYSICAL_ADDRESS`
- `OUTBOUND_SECRET_KEY`
- `CORS_ORIGIN`

Frontend:
- `NEXT_PUBLIC_OUTBOUND_API_BASE`

## Docker
Bring up the full stack:

```bash
docker compose up --build
```

That starts PostgreSQL, Redis, the backend API, the BullMQ worker, and the Next.js frontend.

## CI
GitHub Actions CI lives in `.github/workflows/ci.yml` and runs backend and frontend builds on every push and pull request.
