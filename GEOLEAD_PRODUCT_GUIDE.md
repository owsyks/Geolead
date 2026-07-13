# GeoLead Product and Architecture Guide

## Product Idea

GeoLead is a web-only B2B prospecting and domain-sales workspace. It helps a domain investor, broker, or sales team turn a geo-domain such as `MiamiDentist.com` into a researched list of relevant businesses, contact them with personalized outreach, manage replies, and move opportunities through a sales pipeline.

The user does not supply or consume a personal search API key. Search, crawling, contact discovery, validation, AI generation, queues, and provider fallbacks are platform services operated by GeoLead.

The core promise is simple:

1. Add or import a domain.
2. Discover businesses that could benefit from that domain.
3. Rank the best buyers and contact channels.
4. Send human-sounding, compliant outreach.
5. Track replies, offers, and sales in one workspace.

## Who GeoLead Is For

- Geo-domain investors who need qualified end-user buyers.
- Domain brokers managing multiple assets and negotiations.
- Small B2B sales teams researching businesses by location and niche.
- Portfolio operators who want valuation, buyer intelligence, outreach, and pipeline data connected to the same domain.

## End-to-End Workflow

### 1. Account, verification, and access

Signup begins with email ownership verification. A short-lived verification code is checked before an account, workspace, or session is created. The user then chooses a plan and can pay through Paymento crypto checkout. Billing status and plan limits are always enforced by the backend rather than trusted from the browser.

Current public pricing is:

- Free Trial: $0.
- Starter: $5 for 30 days.
- Pro: $10 for 30 days.

### 2. Portfolio

The portfolio is the source of truth for domain assets. Each record can hold the domain name, niche, location, purchase and renewal information, AI estimate, the owner's asking price, branding and demand scores, tags, notes, buyers, offers, and sale data.

The asking price is intentionally separate from the AI estimate. The estimate is decision support; the owner controls the actual price used in outreach and negotiation.

### 3. Lead Explorer

The user selects a portfolio domain and gives each search a recognizable name. Named searches keep results separated when the same account researches multiple domains, locations, or buyer segments.

GeoLead then:

1. Builds search queries from the domain, niche, and location.
2. Uses GeoLead's platform-managed Serper keys to discover candidate websites.
3. Crawls each discovered public website directly.
4. Extracts business details, public contact pages, email addresses, telephone numbers, social links, and location signals.
5. Validates and scores the collected data.
6. Stores every lead under both the authenticated tenant and the exact search task.

Search depth is a discovery target, not a guarantee of the same number of unique leads. Search-engine overlap, duplicates, inaccessible websites, irrelevant results, and validation filters can reduce the final count. Query expansion and deduplication aim to increase unique results without wasting one API request per lead.

### 4. Lead intelligence and validation

Leads are enriched with domain-match, buyer-intent, business-quality, priority, and decision-maker signals. Email status distinguishes valid, risky, and invalid addresses.

Phone and WhatsApp analysis is self-hosted. It normalizes numbers and evaluates country, type, source, and website evidence. A WhatsApp score is a likelihood signal, not proof that an account exists; GeoLead does not claim direct WhatsApp registration verification when that cannot be established safely and legally.

Users can select the current page, all leads in a named search, or only valid leads when creating a campaign.

### 5. AI email generation

The standalone AI Email Generator and the Campaign builder share the same outreach principles:

- Write like a concise human, not a mass-mail template.
- Use verified lead and portfolio context.
- Avoid fabricated facts, deceptive urgency, spam phrases, excessive links, and unsafe HTML.
- Include the user's asking price only when appropriate.
- Generate distinct initial-message variants and follow-up variants.
- Sanitize and rescore model output before it can be approved.

When a configured remote AI provider is unavailable, GeoLead uses a local deterministic fallback that follows the same sequence contract. Provider discovery and generation are tenant-scoped so one customer's configuration cannot affect another customer's result.

### 6. Campaigns and sending

A campaign binds one portfolio domain, one named lead search, selected tenant-owned leads, a sender account, initial variants, follow-ups, timing, and compliance controls.

The queue worker handles paced delivery, retries, suppression checks, follow-up scheduling, and status updates. Sender credentials are encrypted at rest and never returned to the browser. Users can configure supported SMTP or Resend senders, while platform verification email credentials remain separate from customer outreach credentials.

### 7. Inbox, offers, and sales pipeline

Replies arrive through supported provider webhooks or a tenant-owned IMAP mailbox. Reply matching requires ownership agreement between the mailbox, campaign, lead, and message identifiers so replies cannot cross tenants.

The Sales Kanban turns portfolio status into a mobile-friendly and desktop-friendly pipeline. Users can move domains through stages, review asking price and estimated value, record buyers and offers, and close a sale without losing the history attached to the domain.

### 8. Watchlist and analytics

The watchlist tracks opportunities and reminders. Analytics combines campaign delivery, engagement, reply, and sales information so the user can compare buyer segments and outreach strategies.

## System Architecture

### Frontend

- Next.js 16 and React 19.
- Hosted on Vercel from GitHub.
- Responsive public pages and authenticated dashboard.
- Access tokens are held in memory; refresh credentials use secure, HttpOnly cookies.
- The browser calls only the GeoLead backend. Provider secrets and platform API keys never belong in frontend code.

### Backend and worker

- Node.js, TypeScript, and Express on the VPS.
- Prisma provides typed PostgreSQL access and migrations.
- Redis and BullMQ provide queues, shared rate limits, and background work.
- A separate worker performs crawling, enrichment, verification, and campaign jobs.
- Nginx terminates public HTTPS and proxies the API to a backend bound only to `127.0.0.1`.

### Data and infrastructure

- PostgreSQL 17 stores accounts, domains, searches, leads, campaigns, messages, billing attempts, and audit state.
- Redis 7 is internal-only and persists queue data.
- PostgreSQL and Redis do not publish public host ports.
- GitHub Actions builds and deploys the VPS services, applies Prisma migrations, and runs post-deployment discovery, tenant-isolation, auth/billing, and Paymento readiness audits.

### External services

- Serper: platform-managed web discovery, with key rotation/fallback inside the backend.
- Resend: account verification email and supported outbound sending.
- SMTP/IMAP: tenant-owned sending and reply ingestion where configured.
- Paymento: crypto checkout and signed IPN payment confirmation.
- AI providers: configured remote generation with a secure local fallback.

## Multi-Tenant Data Isolation

Every authenticated object belongs to a user tenant. Domain IDs, search-task IDs, leads, senders, templates, campaigns, replies, mailbox data, verification jobs, exports, webhook history, and billing attempts are queried through ownership predicates.

The browser cannot make a record accessible by changing an ID. Related objects are revalidated on the server before use, inaccessible objects return not-found behavior, background jobs carry the owner ID, and deployment audits check historical relations for cross-tenant or orphaned data.

Browser caches that contain account data are namespaced by user ID and cleared or rehydrated when identity changes.

## Security and Compliance Model

- Email ownership is proven before signup.
- Passwords use modern salted hashing.
- Refresh sessions rotate and detect replay.
- Sensitive cookies are Secure, HttpOnly, and appropriately SameSite-scoped.
- CORS uses an explicit production origin allowlist.
- CSP, HSTS, frame denial, MIME sniffing protection, and referrer controls are applied.
- Rate limits use Redis in production and fail closed when protection state is unavailable.
- Webhook signatures are verified against the exact raw body and replay-protected.
- Paymento fulfillment verifies the provider response and a stored price-bound payment attempt before granting access.
- Crawlers, SMTP, IMAP, redirects, and certificate probes use SSRF controls that reject internal and reserved network targets.
- Spreadsheet imports are bounded and exports neutralize formula injection.
- Suppression, unsubscribe, and do-not-contact state is checked before delivery.
- Secrets are supplied through deployment environments and encrypted where stored; they are never committed to Git.

## Billing Behavior

The backend plan catalogue is the only pricing authority. The frontend renders that catalogue, and checkout creation resolves the amount from the selected server-side tier. A client cannot lower the amount by changing browser data.

Paymento checkout creates a pending payment attempt before redirect. Signed IPN data is verified against Paymento, the stored order/token, the expected amount, and the expected plan. Entitlement changes and payment completion are committed atomically. Duplicate events are idempotent, and concurrent payments cannot downgrade an active Pro account.

## Operational Notes

- Production migrations run automatically before the API starts.
- Deployments fail when builds or readiness audits fail.
- API health is available at `/api/health`.
- Platform search, verification, payment, and email secrets must be rotated if exposed and stored only in GitHub/VPS secret environments.
- The changed local SSH host key must be independently verified before direct SSH access is restored; GitHub deployment remains the controlled release path.

## Product Boundary

GeoLead helps research and contact relevant businesses. It does not guarantee that every search result is unique, every public contact is current, every email will be delivered, every WhatsApp score represents an active account, or every prospect will buy a domain. The platform should present these as evidence-based signals and workflow automation, not certainty.
