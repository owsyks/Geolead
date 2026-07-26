# GeoLead AI — Deployment Guide (Vercel + Heroku)

- **Frontend (Next.js)** → Vercel
- **Backend (Express + Prisma + workers + WebSocket)** → VPS Server (`0xvon@bore.pub` port `35802`)
- **CI/CD Deployment** → GitHub Actions (`.github/workflows/deploy.yml`)

---

## Target Server Configuration (`0xvon@bore.pub` Port `35802`)

To switch or redeploy the server backend via the **bore.pub tunnel**:

### 1. Update GitHub Repository Secrets (for Automated CI/CD)
Navigate to your GitHub Repository → **Settings** → **Secrets and variables** → **Actions**, and set:
- `SSH_HOST`: `bore.pub`
- `SSH_PORT`: `35802`
- `SSH_USER`: `0xvon`
- `SSH_KEY`: *(Your private SSH key authorized for user `0xvon`)*

### 2. Manual / One-Click Script Deployment
Run the automated deployment helper from the repository root:

- **PowerShell (Windows)**:
  ```powershell
  .\deploy\deploy-vps-bore.ps1
  ```
- **Bash (Linux / Mac)**:
  ```bash
  chmod +x deploy/deploy-vps-bore.sh
  ./deploy/deploy-vps-bore.sh
  ```


---

## 0. Prerequisites (one time)

```powershell
# Install CLIs
winget install Heroku.HerokuCLI      # or: npm i -g heroku
npm i -g vercel

heroku login
vercel login
```

You'll also need your domain's DNS panel open (you said you have a domain ready).

---

## 1. Put the project in git (required by both hosts)

From the repo root `C:\Users\VVV\Desktop\SaaS`:

```powershell
git init
git add .
git commit -m "Prepare GeoLead AI for deployment"
```

`.gitignore` is already set so `node_modules`, `dist`, `.env`, and logs are excluded.

---

## 2. Backend → Heroku

### 2a. Create the app + database

```powershell
heroku create geolead-ai-api          # pick a unique name; this becomes <app>.herokuapp.com
heroku addons:create heroku-postgresql:essential-0 -a geolead-ai-api
# Optional Redis (BullMQ). Skip to save money — in-process fallback works:
# heroku addons:create heroku-redis:mini -a geolead-ai-api
```

`DATABASE_URL` (and `REDIS_URL` if you added Redis) are set automatically.

### 2b. Set config vars (secrets)

```powershell
# A STABLE encryption key — generate once, never change it, or stored API keys
# in Settings become undecryptable. (Heroku rotates DATABASE_URL, so we must
# NOT rely on the default fallback.)
heroku config:set OUTBOUND_SECRET_KEY="$([guid]::NewGuid().ToString('N'))$([guid]::NewGuid().ToString('N'))" -a geolead-ai-api

# Public base URL of THIS backend — tracking pixels, click + unsubscribe links
# are baked from it. Use the custom domain if you set one in step 4.
heroku config:set OUTBOUND_BASE_URL="https://geolead-ai-api.herokuapp.com" -a geolead-ai-api

# Allow the frontend origin (set to your Vercel URL / custom domain from step 3-4)
heroku config:set CORS_ORIGIN="https://your-frontend-domain.com" -a geolead-ai-api

# Compliance footer + provider keys (or set these later in the in-app Settings UI)
heroku config:set OUTBOUND_PHYSICAL_ADDRESS="Your Company, Street, City, ZIP" -a geolead-ai-api
heroku config:set NVIDIA_API_KEY="nvapi-..." -a geolead-ai-api
heroku config:set RESEND_API_KEY="re_..." -a geolead-ai-api
heroku config:set SERPER_API_KEY="..." -a geolead-ai-api
```

> Postgres on Heroku requires SSL. If Prisma reports an SSL error, append
> `?sslmode=require` to the URL:
> `heroku config:set DATABASE_URL="$(heroku config:get DATABASE_URL -a geolead-ai-api)?sslmode=require" -a geolead-ai-api`

### 2c. Deploy only the `backend/` subfolder

The repo is a monorepo, so push the `backend` subtree as the app root (its
`Procfile` lives there). The `release:` line runs `prisma migrate deploy`
automatically on every deploy.

```powershell
heroku git:remote -a geolead-ai-api
git subtree push --prefix backend heroku main
```

> Subsequent deploys: `git subtree push --prefix backend heroku main` again.
> (If a push is rejected after a rebase, force it via:
> `git push heroku ``git subtree split --prefix backend main``:main --force`.)

### 2d. Keep it always-on

```powershell
heroku ps:scale web=1:basic -a geolead-ai-api
heroku logs --tail -a geolead-ai-api      # watch it boot
```

Verify: open `https://geolead-ai-api.herokuapp.com/api/health` → `{"status":"OK"}`.

---

## 3. Frontend → Vercel

```powershell
cd frontend
vercel link            # create/link a project
```

In the Vercel project settings (dashboard or prompts):
- **Root Directory:** `frontend`
- **Framework Preset:** Next.js (auto-detected)
- **Environment Variable:**
  `NEXT_PUBLIC_OUTBOUND_API_BASE = https://geolead-ai-api.herokuapp.com`
  (or your backend custom domain from step 4 — must be the public `https://` URL;
  the app derives the `wss://` WebSocket URL from it automatically.)

Then deploy:

```powershell
vercel --prod
```

After this, go back and update the backend's `CORS_ORIGIN` to the real Vercel URL
(step 2b) and redeploy the backend if you hadn't set it yet.

---

## 4. Custom domain (you have one ready)

Recommended split:
- Frontend → `app.yourdomain.com` (or apex `yourdomain.com`)
- Backend  → `api.yourdomain.com`

**Backend (Heroku):**
```powershell
heroku domains:add api.yourdomain.com -a geolead-ai-api
```
Heroku prints a DNS target (e.g. `xxxx.herokudns.com`). In your DNS panel add a
**CNAME**: `api` → that target. Then:
```powershell
heroku certs:auto:enable -a geolead-ai-api    # free automated TLS
```
Update `OUTBOUND_BASE_URL` → `https://api.yourdomain.com` and redeploy.

**Frontend (Vercel):** Add `app.yourdomain.com` under the project's *Domains*
tab and follow the CNAME/A-record instructions Vercel shows. Update
`NEXT_PUBLIC_OUTBOUND_API_BASE` → `https://api.yourdomain.com` and redeploy.
Update backend `CORS_ORIGIN` → `https://app.yourdomain.com`.

---

## 5. Email deliverability (Resend)

In the Resend dashboard, **verify your sending domain** (add the SPF + DKIM DNS
records Resend gives you). Without this, real sends land in spam or fail. Then
set the verified `from:` address in the app's sender settings.

The Gmail IMAP mailbox (reply inbox) keeps working as-is — it polls from the
always-on dyno. Re-enter the mailbox app password in **Settings → Inbox** once,
since the production DB starts empty.

---

## 6. Post-deploy checklist

- [ ] `GET /api/health` returns OK on the backend domain
- [ ] Frontend loads and the dashboard isn't showing the "Backend offline" banner
- [ ] `CORS_ORIGIN` matches the exact frontend origin (scheme + host, no trailing slash)
- [ ] `OUTBOUND_BASE_URL` matches the public backend URL (check a tracking/unsubscribe link)
- [ ] `OUTBOUND_SECRET_KEY` is set and will never change
- [ ] Resend domain verified (SPF/DKIM)
- [ ] API keys re-entered in Settings (NVIDIA, Resend, Serper) — DB starts fresh
- [ ] Gmail mailbox app password re-entered in Settings → Inbox
- [ ] Send one test campaign to your own address end-to-end

---

## Cost (rough, USD/mo)
- Heroku Basic dyno: ~$7
- Heroku Postgres essential-0: ~$5
- Heroku Redis mini (optional): ~$3
- Vercel Hobby: $0 (fine for this)
- **Total: ~$12–15/mo** without Redis.
