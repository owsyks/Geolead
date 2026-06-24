# Crawler Multi-Usage Hardening — Spec (Python crawler, `~/Desktop/crawl`)

Goal: make ONE shared crawler safe under many concurrent searches (multiple GeoLead
users / jobs at once) on modest PC/VPS hardware — without full multi-tenancy. The
GeoLead side is already fixed (no longer kills foreign jobs). These are the changes
needed in the Python crawler itself.

Severity legend: **P0** = OOM/cross-user safety, **P1** = stability, **P2** = nice-to-have.

## P0 — Global concurrency semaphore (prevents OOM)
**Problem:** `app/routes.py` `POST /api/search` → `background.add_task(run_search_job, …)`
starts every job immediately. `app/crawler/engine.py:run_search_job` spawns a per-job
`ThreadPoolExecutor` + stealth Chromium. `BROWSER_CONCURRENCY`/`MAPS_CONCURRENCY` are
**per-job, not global**. 10 jobs × 1–3 browsers = 10–30 Chromium (~300–500MB each) →
3–15GB → crash.
**Fix:** a process-wide `asyncio.Semaphore` (or a bounded job queue) capping TOTAL
concurrent **running jobs** (e.g. `GLOBAL_MAX_JOBS`, default 2–3 for a PC), AND a
process-wide cap on TOTAL concurrent browser instances across all jobs
(`GLOBAL_MAX_BROWSERS`). Jobs beyond the cap stay `pending` until a slot frees.
Add both to `app/config.py` + `.env`. Acquire in `run_search_job` before spawning the
pool; the browser-launch path (`app/crawler/fetcher.py`) acquires the browser semaphore.

## P0 — Per-job hard deadline
**Problem:** no job timeout; a hung browser/proxy holds a thread + RAM forever
(`engine.py` has per-page timeouts only).
**Fix:** wrap each job in an overall deadline (`JOB_TIMEOUT_S`, e.g. 900s). On expiry:
mark job `failed`/`stopped`, kill its browser processes, release semaphores.

## P1 — Shared proxy harvest across jobs
**Problem:** `engine.py` creates a NEW `ProxyPool` per job → N concurrent jobs = N
redundant free-proxy harvests (wasted bandwidth, duplicate source hits); `proxy.py`
`_real_ip_cache` is global already.
**Fix:** one process-level shared `ProxyPool` (harvest once, refill in background) that
all jobs borrow from, keeping per-job health/cooldown views if needed. Cuts startup
latency and proxy-source load under concurrency.

## P1 — Reset sticky fetcher failure flags
**Problem:** `app/crawler/fetcher.py` module globals `_stealth_failed/_dynamic_failed/
_curl_failed` are set once and never cleared → one transient stealth import/launch
failure disables stealth for ALL later jobs in the process.
**Fix:** make these per-attempt or time-boxed (retry after a cooldown), not permanently
sticky.

## P2 — Lightweight job ownership (defense in depth)
**Problem:** jobs have no owner; `GET /api/jobs` + `/jobs/{id}/stop` are global. GeoLead
now only stops ids it recorded, but an owner token makes the crawler itself safe.
**Fix:** accept optional `owner` on `POST /api/search` (store on `search_jobs`); add
`?owner=` filter to `GET /api/jobs` and reject `stop`/`pause`/`resume` when the caller's
owner doesn't match. GeoLead would pass a per-deployment (or per-user) owner token.

## Config additions (`app/config.py` + `.env`)
| Var | Default | Meaning |
|---|---|---|
| `GLOBAL_MAX_JOBS` | 2 | total concurrent running jobs |
| `GLOBAL_MAX_BROWSERS` | 2 | total concurrent Chromium across all jobs |
| `JOB_TIMEOUT_S` | 900 | per-job hard deadline |
| `SHARED_PROXY_POOL` | true | one harvest shared by all jobs |

## Verify
1. Start crawler. Fire 5 `POST /api/search` at once → only `GLOBAL_MAX_JOBS` go
   `running`, rest stay `pending`; RAM stays bounded (watch Task Manager: Chromium count
   ≤ `GLOBAL_MAX_BROWSERS`).
2. A job that hangs flips to `failed` after `JOB_TIMEOUT_S` and frees a slot.
3. One stealth failure does not disable stealth for the next job.
