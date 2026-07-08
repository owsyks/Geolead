# VPS deployment runbook (Heroku → self-managed server)

Backend + Postgres + Redis + worker run as Docker Compose on the box; Nginx +
Let's Encrypt terminate TLS at `https://api.geolead.tech`. Frontend stays on
Vercel, repointed at the new API host.

## 0. DNS
Add an A record: `api.geolead.tech → <SERVER_IP>`. Wait for it to resolve
(`dig +short api.geolead.tech`) before running certbot.

## 1. Provision the box (Ubuntu 22.04/24.04, as root/sudo)
```bash
apt-get update && apt-get install -y ca-certificates curl gnupg nginx
# Docker Engine + Compose plugin
install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo $VERSION_CODENAME) stable" > /etc/apt/sources.list.d/docker.list
apt-get update && apt-get install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin python3-certbot-nginx
systemctl enable --now docker
# Firewall
ufw allow OpenSSH && ufw allow 'Nginx Full' && ufw --force enable
```

## 2. Get the code + env
```bash
mkdir -p /opt/geolead && cd /opt/geolead
git clone -b feat/auth-multi-tenancy <REPO_URL> .
cp deploy/env.production.example .env   # then fill in real secrets (see step 3)
```

## 3. Secrets → /opt/geolead/.env
On a machine logged into Heroku:
```bash
heroku config -s -a geolead-ai-api > heroku.env
scp heroku.env <user>@<SERVER_IP>:/opt/geolead/heroku.env
```
On the server, merge the secret values from `heroku.env` into `.env`. Set a
strong `POSTGRES_PASSWORD`. Leave `DATABASE_URL`/`REDIS_URL` OUT of `.env`
(compose sets them internally). Delete `heroku.env` afterward.

## 4. Migrate the database
```bash
# On the Heroku-logged-in machine:
heroku pg:backups:capture -a geolead-ai-api
heroku pg:backups:download -a geolead-ai-api        # -> latest.dump
scp latest.dump <user>@<SERVER_IP>:/opt/geolead/latest.dump

# On the server:
cd /opt/geolead
docker compose -f docker-compose.prod.yml up -d postgres
sleep 5
docker compose -f docker-compose.prod.yml exec -T postgres \
  pg_restore --clean --if-exists --no-owner -U postgres -d geolead_ai < latest.dump
rm latest.dump
```

## 5. Bring up the full stack
```bash
cd /opt/geolead
docker compose -f docker-compose.prod.yml up -d --build
docker compose -f docker-compose.prod.yml logs -f backend worker   # verify
```
Backend runs `prisma migrate deploy` on boot (idempotent) then listens on
127.0.0.1:5000.

## 6. Nginx + TLS
```bash
cp deploy/nginx/geolead-ws-upgrade.conf /etc/nginx/conf.d/
cp deploy/nginx/api.geolead.tech.conf /etc/nginx/sites-available/
ln -sf /etc/nginx/sites-available/api.geolead.tech.conf /etc/nginx/sites-enabled/
nginx -t && systemctl reload nginx
certbot --nginx -d api.geolead.tech --non-interactive --agree-tos -m <admin-email> --redirect
```

## 7. Verify
```bash
curl -i https://api.geolead.tech/api/domains/statuses   # expect 200 or 401 over valid TLS
```
Then repoint Vercel: set `NEXT_PUBLIC_OUTBOUND_API_BASE=https://api.geolead.tech`
(Production) and redeploy. Log in on https://www.geolead.tech and run an
Acquisition scan end-to-end.

## 8. Cutover
After a day of clean operation:
```bash
heroku ps:scale web=0 worker=0 -a geolead-ai-api   # keep app/DB a few days as rollback
```

## Redeploys (after CI/CD swap)
```bash
cd /opt/geolead && git pull && docker compose -f docker-compose.prod.yml up -d --build
```
