# VPS End-to-End Deployment Guide (single VPS — dev + prod)

**Track:** [deploy-all-in-one-vps](README.md) · [Prerequisites](../vps-started/01-prerequisites.md) first · [Docs index](../README.md)

Deploy **dev and prod** on **one VPS** (both Postgres/Redis instances, `/apps/*/dev` and `/apps/*/prod`).

| Guide | Use when |
|-------|----------|
| **[Dev deploy](../deploy-dev/01-deploy.md)** | Dedicated **dev-only** VPS |
| **[Prod deploy](../deploy-prod/01-deploy.md)** | Dedicated **prod-only** VPS |
| **[Prerequisites](../vps-started/01-prerequisites.md)** | Node, Docker, nginx, PM2, pnpm (run first) |
| **[Infra templates](../vps-started/infra/README.md)** | `docker-compose` + `.env.data` templates for `/apps` |
| **[Adminer + Redis Insight](../vps-started/04-data-tools-adminer-redis.md)** | Adminer + Redis Insight (Postgres/Redis GUI) |
| **[Cleanup and reset](../vps-started/03-cleanup-and-reset.md)** | Full cleanup, DB/Redis volume reset |

> **Legacy:** [refactor-fullstack-structure-guide.md](../refactor-fullstack-structure-guide.md), [quick-fix-full-setup-guide.md](../quick-fix-full-setup-guide.md)

Per-repo CI details:

- [plys-monorepo-webapps/docs/deployment.md](../plys-monorepo-webapps/docs/deployment.md)
- [plys-internal-hub/docs/deployment.md](../plys-internal-hub/docs/deployment.md)
- [plys-internal-hub-serivce-api/docs/deployment/overview.md](../plys-internal-hub-serivce-api/docs/deployment/overview.md)

---

## Architecture

| VPS path | Repository | Runtime |
|----------|------------|---------|
| `/apps/plys-webapps/{dev,prod}/current` | plys-monorepo-webapps | 4 Next.js apps (Docker + PM2) |
| `/apps/internal-hub-fe/{dev,prod}/current` | plys-internal-hub | 3 Next.js apps |
| `/apps/internal-hub-be/{dev,prod}/current` | plys-internal-hub-serivce-api | api-gateway + 10 gRPC services (11 total) |
| `/apps/docker-compose.yml` | [docs/vps-started/infra/](../vps-started/infra/README.md) | Postgres + Redis (dev **and** prod) |

Postgres/Redis are **not** started by application compose files on the VPS; they run from `/apps/docker-compose.yml`.

### Conventions

All command blocks below are run **on the VPS** unless labeled otherwise. Copy compose files with `sudo nano` (templates live under `docs/` in the repo you maintain off-server).

---

## 1. Full clean VPS (greenfield reset)

**Warning:** destructive. For step-by-step cleanup and **database-only** reset (remove volume + recreate), use **[Cleanup and reset](../vps-started/03-cleanup-and-reset.md)**.

Summary below (combined dev + prod on one VPS). Skip to [Section 1.5](#15-canonical-db--redis-naming) if the VPS is already empty.

### 1.1 Backup (optional)

**On VPS** (skip if this is a fresh VPS with no data):

```bash
mkdir -p ~/backups/$(date +%Y%m%d)
cd ~/backups/$(date +%Y%m%d)

docker exec postgres-prod pg_dump -U plys_prod plys-db -Fc -f plys-db-prod.dump 2>/dev/null || true
docker exec postgres-dev  pg_dump -U plys_dev  plys-db-dev -Fc -f plys-db-dev.dump 2>/dev/null || true
sudo tar czf apps-logs-backup.tgz /apps/*/logs 2>/dev/null || true

ls -la ~/backups/$(date +%Y%m%d)
```

### 1.2 Stop all runtime

**On VPS:**

```bash
pm2 list
pm2 kill
pm2 unstartup systemd 2>/dev/null || true

docker ps
docker stop $(docker ps -q) 2>/dev/null || true
docker ps   # should show nothing running
```

**On VPS** — confirm no legacy PM2 apps returned after `pm2 list` (if you ran `pm2 kill`, list may be empty):

```bash
pm2 list | grep -E 'marketing-ployos|ployos-|lonaos-|plys-webapps|internal-hub' || echo "OK: no legacy PM2 names"
```

### 1.3 Remove Docker Postgres + Redis

**On VPS:**

```bash
sudo mkdir -p /apps
cd /apps

docker compose down 2>/dev/null || true
docker rm -f postgres-dev postgres-prod redis-dev redis-prod 2>/dev/null || true

docker volume ls | grep -E 'postgres|redis'
```

If volume names differ from `apps_*`, remove what `docker volume ls` shows, for example:

```bash
docker volume rm apps_postgres-dev-data apps_postgres-prod-data apps_redis-dev-data apps_redis-prod-data 2>/dev/null || true
# or: docker volume prune   # only if you intend to delete ALL unused volumes
```

### 1.4 Wipe deploy directories

**On VPS:**

```bash
sudo rm -rf \
  /apps/marketing-ployos /apps/ployos /apps/lonaos \
  /apps/ployos-app /apps/lonaos-app \
  /apps/plys-webapps /apps/internal-hub-fe /apps/internal-hub-be \
  /apps/environments

# Keep /apps as the root; remove old compose if present
sudo rm -f /apps/docker-compose.yml /apps/.env.data

ls -la /apps
```

Do **not** recreate `/apps/environments/` — monorepos render env in CI.

### 1.5 Canonical DB / Redis naming

Source of truth: `plys-internal-hub-serivce-api/infra/env/.env.dev` and `.env.prod`.

| Resource | Dev | Prod |
|----------|-----|------|
| Database (`POSTGRES_DB` / `DB_DATABASE`) | `plys-db-dev` | `plys-db` |
| DB user (`POSTGRES_USER` / `DB_USERNAME`) | `plys_dev` | `plys_prod` |
| DB port (host) | `5433` | `5432` |
| Redis port (host) | `6380` | `6379` |
| `REDIS_KEY_PREFIX` | `app:dev:` | `app:prod:` |
| `THROTTLE_REDIS_PREFIX` | `throttle:dev:` | `throttle:prod:` |

#### Step 1.5.1 — Copy templates from `docs/vps-started/infra/` to `/apps`

All templates: **[docs/vps-started/infra/README.md](../vps-started/infra/README.md)**

**On VPS:**

```bash
sudo nano /apps/docker-compose.yml
# Paste full contents from docs/vps-started/infra/docker-compose.data.yml (combined VPS), save.

sudo nano /apps/.env.data
# Paste docs/vps-started/infra/env.data.example, replace every CHANGE_ME with passwords from:
#   openssl rand -hex 24
```

#### Step 1.5.2 — Generate passwords and save to `/apps/.env.data`

**On VPS** (run four times; save output in a password manager):

```bash
export POSTGRES_DEV_PASSWORD="$(openssl rand -hex 24)"
export POSTGRES_PROD_PASSWORD="$(openssl rand -hex 24)"
export REDIS_DEV_PASSWORD="$(openssl rand -hex 24)"
export REDIS_PROD_PASSWORD="$(openssl rand -hex 24)"

# Persist for docker compose (deploy user must be able to read this file)
sudo tee /apps/.env.data > /dev/null <<EOF
POSTGRES_DEV_PASSWORD=${POSTGRES_DEV_PASSWORD}
POSTGRES_PROD_PASSWORD=${POSTGRES_PROD_PASSWORD}
REDIS_DEV_PASSWORD=${REDIS_DEV_PASSWORD}
REDIS_PROD_PASSWORD=${REDIS_PROD_PASSWORD}
EOF
sudo chown "$USER:$USER" /apps/.env.data
chmod 600 /apps/.env.data
ls -la /apps/.env.data   # expect: -rw------- 1 <your-user> <your-group>

# Load into current shell (do not use "sudo source" — source is a bash builtin)
set -a && source /apps/.env.data && set +a
```

If you already created the file and see `permission denied`, fix ownership once:

```bash
sudo chown "$USER:$USER" /apps/.env.data
chmod 600 /apps/.env.data
```

#### Step 1.5.3 — Start Postgres + Redis + data GUI

**On VPS:**

```bash
cd /apps
docker compose --env-file /apps/.env.data config   # validate compose + env substitution
docker compose --env-file /apps/.env.data up -d postgres-dev postgres-prod redis-dev redis-prod adminer redisinsight
sleep 5
docker compose ps
```

Run as your **deploy user** (not only via `sudo`), so Compose can read `/apps/.env.data`. If it still fails, re-run the `chown` block in step 1.5.2.

Expected: six containers `Up` — `postgres-dev`, `postgres-prod`, `redis-dev`, `redis-prod`, `adminer`, `redisinsight`.

Browser GUI (optional): [Adminer + Redis Insight](../vps-started/04-data-tools-adminer-redis.md).

#### Step 1.5.4 — Verify DB and Redis

**On VPS:**

```bash
set -a && source /apps/.env.data && set +a

docker exec postgres-dev psql -U plys_dev -d plys-db-dev -c "SELECT current_user, current_database();"
docker exec postgres-prod psql -U plys_prod -d plys-db -c "SELECT current_user, current_database();"

redis-cli -p 6380 -a "$REDIS_DEV_PASSWORD" --no-auth-warning PING
redis-cli -p 6379 -a "$REDIS_PROD_PASSWORD" --no-auth-warning PING

ss -tlnp | grep -E '5432|5433|6379|6380'
```

Expected: `current_database` = `plys-db-dev` / `plys-db`; Redis returns `PONG`.

#### Step 1.5.5 — Data tools (optional)

Browser GUIs for Postgres and Redis — [Adminer + Redis Insight](../vps-started/04-data-tools-adminer-redis.md).

One **Adminer** and one **Redis Insight** container serve both environments. In Adminer, pick server `postgres-dev` or `postgres-prod`; in Redis Insight, add connections for `redis-dev` and `redis-prod` (Docker service names).

1. Containers are started in step 1.5.3 (`adminer`, `redisinsight`).
2. Create `/etc/nginx/.htpasswd-data-tools` and nginx vhosts for all four GUI hostnames (data-tools guide §4.1–4.2).
3. Add `-d db-dev.plyshub.space -d redis-dev.plyshub.space -d db.plyshub.space -d redis.plyshub.space` to certbot in §4.3 (or use SSH tunnel only).

#### Step 1.5.6 — OpenObserve monitoring (optional)

On a combined host, run **one** OpenObserve stack that ingests dev and prod PM2 logs. OTEL filelog sets `deployment.environment` from each log path (`dev` or `prod`).

1. Create `/apps/monitoring/{current,data}` — [Prerequisites §4](../vps-started/01-prerequisites.md#4-create-apps-layout).
2. Configure nginx for `observe-dev.plyshub.space` and/or `observe.plyshub.space` (both can proxy to `127.0.0.1:5080`).
3. After app deploys populate `/apps/*/dev/logs` and `/apps/*/prod/logs`, run **`plys-dev-ops` → Deploy monitoring — Dev** with workflow input `deploy_env: combined`.

Full guide: [OpenObserve monitoring](../vps-started/06-monitoring-openobserve.md#combined-vps-all-in-one).

#### Step 1.5.5 — Sync passwords to GitHub (backend repo)

In **GitHub → plys-internal-hub-serivce-api → Settings → Environments**:

| Environment | Secret | Value (from `/apps/.env.data`) |
|-------------|--------|--------------------------------|
| `dev` | `DB_PASSWORD` | `POSTGRES_DEV_PASSWORD` |
| `dev` | `REDIS_PASSWORD` | `REDIS_DEV_PASSWORD` |
| `production` | `DB_PASSWORD` | `POSTGRES_PROD_PASSWORD` |
| `production` | `REDIS_PASSWORD` | `REDIS_PROD_PASSWORD` |

The deploy workflow injects these into rendered `.env.dev` / `.env.prod` as `DB_PASSWORD` and `REDIS_PASSWORD` (must match what Postgres/Redis use above). With self-hosted runners, the workflow runs on the target VPS and writes the rendered files locally.

### 1.6 Recreate app directories

Same paths as [Prerequisites §4](../vps-started/01-prerequisites.md#4-create-apps-layout) (combined layout) or [§3.5.4](../vps-started/01-prerequisites.md#354-create-deploy-directories-and-grant-runner-access) (runner-owned).

**On VPS** — after a full clean (§1), recreate then set ownership for whoever deploys:

```bash
sudo mkdir -p /apps/source
sudo mkdir -p /apps/plys-webapps/{dev,prod}/{current,logs}
sudo mkdir -p /apps/internal-hub-fe/{dev,prod}/{current,logs}
sudo mkdir -p /apps/internal-hub-be/{dev,prod}/{current,logs}

# Self-hosted runner:
# sudo chown -R github-runner:github-runner /apps/source /apps/plys-webapps /apps/internal-hub-fe /apps/internal-hub-be

# Manual deploy from SSH user:
sudo chown -R "$USER:$USER" /apps/source /apps/plys-webapps /apps/internal-hub-fe /apps/internal-hub-be

find /apps -maxdepth 3 -type d | sort
```

### 1.7 Nginx cleanup

**On VPS** — list and remove legacy site configs (adjust filenames to what exists on your server):

```bash
ls /etc/nginx/sites-enabled/

# Example: remove old marketing/app sites (ports 3010, 3050, 3070, 3030, 3040)
sudo rm -f /etc/nginx/sites-enabled/dev.ployos.com
sudo rm -f /etc/nginx/sites-enabled/ployos.com
# ... repeat for other legacy symlinks ...

sudo nginx -t
sudo systemctl reload nginx
```

---

## 1b. Reset GitHub Actions runner ↔ VPS sync

### Deploy flow (monorepos only)

1. Build image → push GHCR  
2. `scripts/render-deploy-env.mjs` merges `infra/env/.env.{dev|prod}` + environment secrets  
3. Copy `deploy-package/*` locally to `{APP_DIR}/current` on the VPS runner  
4. Run `docker compose up` + PM2 reload + health check locally on the VPS

### GitHub cleanup checklist

- **Disable** deploy workflows in legacy repos (`ployos/`, `lona/`, `ployos-marketing/`, `lonaos-marketing/`) — they target `/apps/ployos-app/` and `/apps/environments/`.
- Align `IMAGE_REGISTRY` across three monorepos (`ghcr.io/plys-network/...` vs `ghcr.io/plysnetwork/...`).
- Install self-hosted runners on the target VPS hosts — [Self-hosted runner](../vps-started/02-self-hosted-runner.md).
- Remove `VPS_HOST`, `VPS_USER`, `VPS_SSH_KEY`, and `VPS_SSH_PORT` from deploy jobs after they run on self-hosted runners.
- Keep `GHCR_PULL_TOKEN` only when the VPS runner must pull private GHCR images that `GITHUB_TOKEN` cannot access.

### Command guide — VPS ready for self-hosted runner deploy

**On VPS:**

```bash
pm2 list
ls -la /apps/plys-webapps/dev/current      # empty until first deploy
ls -la /apps/internal-hub-be/dev/current   # empty until first deploy
test ! -e /apps/environments && echo "OK: /apps/environments removed"
```

### Command guide — re-sync order (GitHub UI)

Run workflows in this order. Dev jobs use runner group `plys-dev-runners`; prod jobs use `plys-prod-runners` (see [Self-hosted runner §7](../vps-started/02-self-hosted-runner.md#7-workflow-changes-three-monorepos)).

| Step | Repo | Workflow (examples) | Runner | VPS path after success |
|------|------|---------------------|--------|-------------------------|
| 1 | `plys-internal-hub-serivce-api` | **Actions → Deploy Dev** (`deploy-dev.yml`) | `plys-dev-vps` | `/apps/internal-hub-be/dev/current` populated |
| 2 | `plys-internal-hub` | Deploy Dev — internal-hub, admin, reviewer | `plys-dev-vps` | `/apps/internal-hub-fe/dev/current` |
| 3 | `plys-monorepo-webapps` | Deploy Dev — four apps | `plys-dev-vps` | `/apps/plys-webapps/dev/current` |
| 4 | Each repo | **Deploy Prod** workflows (manual, type `deploy`) | `plys-prod-vps` | `*/prod/current` |

**On VPS** — after step 1 (backend):

```bash
curl -sf http://127.0.0.1:4001/api/v1/gateway/health && echo " gateway dev OK"
ls /apps/internal-hub-be/dev/current/.env.dev
```

### Drift rules

- Do not hand-edit `.env.dev` / `.env.prod` on the VPS.  
- On failure, re-run the GitHub workflow on the matching self-hosted runner — do not restore old `current/` without matching secrets.

---

## 2. Cloudflare DNS

### 2.0 DNS only vs Proxied

| Toggle | Label | Use in this guide |
|--------|-------|-------------------|
| Grey cloud | **DNS only** | **All records** (Certbot HTTP-01, WebSockets on API, dev hosts) |
| Orange cloud | **Proxied** | Optional later for marketing only, with Cloudflare Origin Certificate |

### 2.1 Zone: ployos.com

| FQDN | Name | Type | Proxy |
|------|------|------|-------|
| `ployos.com` | `@` | A | DNS only |
| `www.ployos.com` | `www` | CNAME → `@` | DNS only |
| `dev.ployos.com` | `dev` | A | DNS only |
| `app.ployos.com` | `app` | A | DNS only |
| `app-dev.ployos.com` | `app-dev` | A | DNS only |

### 2.2 Zone: lonaos.com

| FQDN | Name | Type | Proxy |
|------|------|------|-------|
| `lonaos.com` | `@` | A | DNS only |
| `dev.lonaos.com` | `dev` | A | DNS only |
| `app.lonaos.com` | `app` | A | DNS only |
| `app-dev.lonaos.com` | `app-dev` | A | DNS only |

### 2.3 Zone: plyshub.space

| FQDN | Name | Type | Proxy |
|------|------|------|-------|
| `plyshub.space` | `@` | A | DNS only |
| `dev.plyshub.space` | `dev` | A | DNS only |
| `admin.plyshub.space` | `admin` | A | DNS only |
| `admin-dev.plyshub.space` | `admin-dev` | A | DNS only |
| `review.plyshub.space` | `review` | A | DNS only |
| `review-dev.plyshub.space` | `review-dev` | A | DNS only |
| `api.plyshub.space` | `api` | A | DNS only |
| `api-dev.plyshub.space` | `api-dev` | A | DNS only |

Never proxy `api*`, `admin*`, `review*`, or `dev` / `*-dev` hosts.

### 2.4 Zone settings

Enable **Always Use HTTPS**, **Automatic HTTPS Rewrites**, **WebSockets** (Network), TLS 1.2 minimum. Use **Full (strict)** only after origin certificates exist.

### 2.5 Verify DNS

**On VPS or local** (replace `203.0.113.10` with your VPS IP):

```bash
export VPS_IP="203.0.113.10"

for host in \
  ployos.com dev.ployos.com app.ployos.com app-dev.ployos.com \
  lonaos.com dev.lonaos.com app.lonaos.com app-dev.lonaos.com \
  plyshub.space dev.plyshub.space admin.plyshub.space api.plyshub.space api-dev.plyshub.space; do
  ip=$(dig +short "$host" A | tail -1)
  if [ "$ip" = "$VPS_IP" ]; then
    echo "OK  $host -> $ip"
  else
    echo "FAIL $host -> $ip (expected $VPS_IP; if 104.x/172.x Cloudflare proxy is still ON)"
  fi
done
```

---

## 3. Ports and routing

| Domain | Env | Port | Service |
|--------|-----|------|---------|
| `dev.ployos.com` | dev | 3001 | ployos-marketing |
| `ployos.com` | prod | 3000 | ployos-marketing |
| `dev.lonaos.com` | dev | 3011 | lonaos-marketing |
| `lonaos.com` | prod | 3010 | lonaos-marketing |
| `app-dev.ployos.com` | dev | 3021 | ployos-app |
| `app.ployos.com` | prod | 3020 | ployos-app |
| `app-dev.lonaos.com` | dev | 3031 | lonaos-app |
| `app.lonaos.com` | prod | 3030 | lonaos-app |
| `dev.plyshub.space` | dev | 3101 | internal-hub |
| `plyshub.space` | prod | 3100 | internal-hub |
| `admin-dev.plyshub.space` | dev | 3201 | internal-admin-hub |
| `admin.plyshub.space` | prod | 3200 | internal-admin-hub |
| `review-dev.plyshub.space` | dev | 3301 | internal-task-reviewer |
| `review.plyshub.space` | prod | 3300 | internal-task-reviewer |
| `api-dev.plyshub.space` | dev | 4001 | api-gateway (+ nginx rewrite) |
| `api.plyshub.space` | prod | 4000 | api-gateway (+ nginx rewrite) |
| gRPC | both | 5001–5009 | loopback only |
| Adminer (loopback) | both | **8080** | Postgres GUI — [Adminer + Redis Insight](../vps-started/04-data-tools-adminer-redis.md) |
| Redis Insight (loopback) | both | **5540** | Redis GUI |

Port audit before deploy:

```bash
ss -tlnp | grep -E '3000|3100|3200|4000'
```

### 3.1 API gateway — `api.plyshub.space` / `api-dev.plyshub.space`

Nest **api-gateway** uses global prefix `api` and version `v1` for **HTTP REST** only. Loopback listens on `/api/v1/...` at port **4000** (prod) or **4001** (dev).

**Realtime notifications** use Socket.IO namespace **`/ws/notifications`** on the same gateway. Socket.IO serves **`/socket.io/`** at the server root — **not** under `/api`. Frontends connect to `wss://api-dev.plyshub.space/ws/notifications` (via engine at `/socket.io/`).

Full nginx rationale: [plys-internal-hub-serivce-api/docs/deployment/nginx-api-gateway.md](../plys-internal-hub-serivce-api/docs/deployment/nginx-api-gateway.md).

Public REST bases **without** `/api` suffix:

- `https://api.plyshub.space`
- `https://api-dev.plyshub.space`

Nginx on `api*.plyshub.space` — **`/socket.io/` and `/ws/` before `location /`**:

```nginx
location /socket.io/ {
    proxy_pass http://127.0.0.1:4000;   # 4001 for api-dev.plyshub.space
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_read_timeout 86400s;
    proxy_send_timeout 86400s;
}

location /ws/ {
    proxy_pass http://127.0.0.1:4000;   # 4001 for api-dev
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_read_timeout 86400s;
    proxy_send_timeout 86400s;
}

location / {
    rewrite ^/(.*)$ /api/$1 break;
    proxy_pass http://127.0.0.1:4000;   # 4001 for api-dev.plyshub.space
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection 'upgrade';
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_cache_bypass $http_upgrade;
    proxy_read_timeout 60s;
}
```

| Public request | Upstream |
|----------------|----------|
| `api.plyshub.space/v1/users` | `127.0.0.1:4000/api/v1/users` |
| `api.plyshub.space/v1/gateway/health` | `127.0.0.1:4000/api/v1/gateway/health` |
| `api.plyshub.space/socket.io/?EIO=4&transport=polling` | `127.0.0.1:4000/socket.io/...` (no `/api` rewrite) |
| Browser WS namespace `/ws/notifications` | Engine at `/socket.io/` on same host |

Env examples:

- `NEXT_PUBLIC_API_URL=https://api-dev.plyshub.space` (webapps — socket at `{origin}/ws/notifications`)
- `NEXT_PUBLIC_API_BASE_URL=https://api.plyshub.space/api` (internal-hub REST; socket uses origin)
- `INTERNAL_AUTH_URL=http://127.0.0.1:4000/api` on VPS (server-side hub FE)
- `ALLOWED_ORIGINS` must list all frontend hosts (see service-api `infra/env/.env.dev`)
- Health loopback: `curl -sf http://127.0.0.1:4000/api/v1/gateway/health`
- Health public: `curl -sf https://api.plyshub.space/v1/gateway/health`
- Socket.IO probe: `curl -sI "https://api-dev.plyshub.space/socket.io/?EIO=4&transport=polling" | head -3`

---

## 4. VPS setup (nginx, TLS, deploy order)

### 4.1 Host packages

Complete **[Prerequisites](../vps-started/01-prerequisites.md)** first (Node 22, Docker, nginx, PM2, pnpm, `/apps` layout, [proxy buffer sizes](../vps-started/01-prerequisites.md#23-nginx-proxy-buffer-sizes)).

### 4.2 Nginx — all application hostnames

Ports match Section 3. Deploy paths use Docker images (no host `alias` to `.next/static` unless you run standalone without Docker).

**Dedicated dev VPS only?** Use the full block in [Dev deploy](../deploy-dev/01-deploy.md) §4 instead of the dev subsection below.

**Dedicated prod VPS only?** Use [Prod deploy](../deploy-prod/01-deploy.md) §4 instead of the prod subsection below.

#### 4.2.1 Development vhosts

**On VPS:**

```bash
sudo tee /etc/nginx/sites-available/dev.ployos.com > /dev/null <<'NGINX'
server {
    listen 80;
    server_name dev.ployos.com;
    location / {
        proxy_pass http://127.0.0.1:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 120s;
    }
}
NGINX
sudo ln -sf /etc/nginx/sites-available/dev.ployos.com /etc/nginx/sites-enabled/

sudo tee /etc/nginx/sites-available/dev.lonaos.com > /dev/null <<'NGINX'
server {
    listen 80;
    server_name dev.lonaos.com;
    location / {
        proxy_pass http://127.0.0.1:3011;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 120s;
    }
}
NGINX
sudo ln -sf /etc/nginx/sites-available/dev.lonaos.com /etc/nginx/sites-enabled/

sudo tee /etc/nginx/sites-available/app-dev.ployos.com > /dev/null <<'NGINX'
server {
    listen 80;
    server_name app-dev.ployos.com;
    location / {
        proxy_pass http://127.0.0.1:3021;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 120s;
    }
}
NGINX
sudo ln -sf /etc/nginx/sites-available/app-dev.ployos.com /etc/nginx/sites-enabled/

sudo tee /etc/nginx/sites-available/app-dev.lonaos.com > /dev/null <<'NGINX'
server {
    listen 80;
    server_name app-dev.lonaos.com;
    location / {
        proxy_pass http://127.0.0.1:3031;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 120s;
    }
}
NGINX
sudo ln -sf /etc/nginx/sites-available/app-dev.lonaos.com /etc/nginx/sites-enabled/

sudo tee /etc/nginx/sites-available/dev.plyshub.space > /dev/null <<'NGINX'
server {
    listen 80;
    server_name dev.plyshub.space;
    location / {
        proxy_pass http://127.0.0.1:3101;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 120s;
    }
}
NGINX
sudo ln -sf /etc/nginx/sites-available/dev.plyshub.space /etc/nginx/sites-enabled/

sudo tee /etc/nginx/sites-available/admin-dev.plyshub.space > /dev/null <<'NGINX'
server {
    listen 80;
    server_name admin-dev.plyshub.space;
    location / {
        proxy_pass http://127.0.0.1:3201;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 120s;
    }
}
NGINX
sudo ln -sf /etc/nginx/sites-available/admin-dev.plyshub.space /etc/nginx/sites-enabled/

sudo tee /etc/nginx/sites-available/review-dev.plyshub.space > /dev/null <<'NGINX'
server {
    listen 80;
    server_name review-dev.plyshub.space;
    location / {
        proxy_pass http://127.0.0.1:3301;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 120s;
    }
}
NGINX
sudo ln -sf /etc/nginx/sites-available/review-dev.plyshub.space /etc/nginx/sites-enabled/

sudo tee /etc/nginx/sites-available/api-dev.plyshub.space > /dev/null <<'NGINX'
server {
    listen 80;
    server_name api-dev.plyshub.space;

    location /socket.io/ {
        proxy_pass http://127.0.0.1:4001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 86400s;
        proxy_send_timeout 86400s;
    }

    location /ws/ {
        proxy_pass http://127.0.0.1:4001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 86400s;
        proxy_send_timeout 86400s;
    }

    location / {
        rewrite ^/(.*)$ /api/$1 break;
        proxy_pass http://127.0.0.1:4001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        proxy_read_timeout 60s;
    }
}
NGINX
sudo ln -sf /etc/nginx/sites-available/api-dev.plyshub.space /etc/nginx/sites-enabled/
```

#### 4.2.2 Production vhosts

**On VPS:**

```bash
sudo tee /etc/nginx/sites-available/ployos.com > /dev/null <<'NGINX'
server {
    listen 80;
    server_name ployos.com www.ployos.com;
    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 120s;
    }
}
NGINX
sudo ln -sf /etc/nginx/sites-available/ployos.com /etc/nginx/sites-enabled/

sudo tee /etc/nginx/sites-available/lonaos.com > /dev/null <<'NGINX'
server {
    listen 80;
    server_name lonaos.com;
    location / {
        proxy_pass http://127.0.0.1:3010;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 120s;
    }
}
NGINX
sudo ln -sf /etc/nginx/sites-available/lonaos.com /etc/nginx/sites-enabled/

sudo tee /etc/nginx/sites-available/app.ployos.com > /dev/null <<'NGINX'
server {
    listen 80;
    server_name app.ployos.com;
    location / {
        proxy_pass http://127.0.0.1:3020;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 120s;
    }
}
NGINX
sudo ln -sf /etc/nginx/sites-available/app.ployos.com /etc/nginx/sites-enabled/

sudo tee /etc/nginx/sites-available/app.lonaos.com > /dev/null <<'NGINX'
server {
    listen 80;
    server_name app.lonaos.com;
    location / {
        proxy_pass http://127.0.0.1:3030;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 120s;
    }
}
NGINX
sudo ln -sf /etc/nginx/sites-available/app.lonaos.com /etc/nginx/sites-enabled/

sudo tee /etc/nginx/sites-available/plyshub.space > /dev/null <<'NGINX'
server {
    listen 80;
    server_name plyshub.space;
    location / {
        proxy_pass http://127.0.0.1:3100;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 120s;
    }
}
NGINX
sudo ln -sf /etc/nginx/sites-available/plyshub.space /etc/nginx/sites-enabled/

sudo tee /etc/nginx/sites-available/admin.plyshub.space > /dev/null <<'NGINX'
server {
    listen 80;
    server_name admin.plyshub.space;
    location / {
        proxy_pass http://127.0.0.1:3200;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 120s;
    }
}
NGINX
sudo ln -sf /etc/nginx/sites-available/admin.plyshub.space /etc/nginx/sites-enabled/

sudo tee /etc/nginx/sites-available/review.plyshub.space > /dev/null <<'NGINX'
server {
    listen 80;
    server_name review.plyshub.space;
    location / {
        proxy_pass http://127.0.0.1:3300;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 120s;
    }
}
NGINX
sudo ln -sf /etc/nginx/sites-available/review.plyshub.space /etc/nginx/sites-enabled/

sudo tee /etc/nginx/sites-available/api.plyshub.space > /dev/null <<'NGINX'
server {
    listen 80;
    server_name api.plyshub.space;

    location /socket.io/ {
        proxy_pass http://127.0.0.1:4000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 86400s;
        proxy_send_timeout 86400s;
    }

    location /ws/ {
        proxy_pass http://127.0.0.1:4000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 86400s;
        proxy_send_timeout 86400s;
    }

    location / {
        rewrite ^/(.*)$ /api/$1 break;
        proxy_pass http://127.0.0.1:4000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        proxy_read_timeout 60s;
    }
}
NGINX
sudo ln -sf /etc/nginx/sites-available/api.plyshub.space /etc/nginx/sites-enabled/
```

**On VPS** — test and reload:

```bash
sudo nginx -t && sudo systemctl reload nginx
```

### 4.3 Certbot

**On VPS** (interactive; use one email for all certs):

```bash
sudo certbot --nginx \
  -d ployos.com -d www.ployos.com -d dev.ployos.com -d app.ployos.com -d app-dev.ployos.com \
  -d lonaos.com -d dev.lonaos.com -d app.lonaos.com -d app-dev.lonaos.com \
  -d plyshub.space -d dev.plyshub.space -d admin.plyshub.space -d admin-dev.plyshub.space \
  -d review.plyshub.space -d review-dev.plyshub.space \
  -d api.plyshub.space -d api-dev.plyshub.space \
  -d db-dev.plyshub.space -d redis-dev.plyshub.space -d db.plyshub.space -d redis.plyshub.space \
  -d observe-dev.plyshub.space -d observe.plyshub.space

sudo certbot renew --dry-run
```

Data GUI nginx: [Adminer + Redis Insight](../vps-started/04-data-tools-adminer-redis.md) §4 (skip `-d db*` / `redis*` if using SSH tunnel only).

Monitoring nginx: [OpenObserve](../vps-started/06-monitoring-openobserve.md) (optional; both observe hosts can proxy to the same `:5080`).

### 4.4 Deploy order

1. Postgres/Redis (Section 1.5)  
2. `internal-hub-be` dev deploy + migrations  
3. `internal-hub-fe` dev (×3 apps)  
4. `plys-webapps` dev (×4 apps)  
5. **`plys-dev-ops` — Deploy monitoring — Dev** with `deploy_env: combined` (after dev app logs exist) — [OpenObserve](../vps-started/06-monitoring-openobserve.md)  
6. Production via manual workflows on `plys-prod-vps`  

### 4.5 Compose on VPS (per bundle)

Normally **GitHub Actions on the VPS self-hosted runner** runs these. Use manually only for debugging.

**On VPS** — backend dev (after bundle landed in `current/`):

```bash
cd /apps/internal-hub-be/dev/current
docker compose -f docker-compose.yml -f docker-compose.apps.yml -f docker-compose.deploy.dev.yml \
  --profile migrate up -d
pm2 startOrReload pm2/dev.config.js
curl -sf http://127.0.0.1:4001/api/v1/gateway/health
```

**On VPS** — single webapp (example `lonaos-app` dev):

```bash
cd /apps/plys-webapps/dev/current
docker compose -f docker-compose.yml -f docker-compose.apps.yml -f docker-compose.deploy.dev.yml \
  up -d lonaos-app
pm2 startOrReload pm2/dev.config.js
curl -sf http://127.0.0.1:3031/api/health
```

---

## 5. GitHub Actions self-hosted runners

### 5.1 Shared flow

Checkout on VPS runner → build/push or pull image → render env → prepare bundle → copy bundle locally to `/apps/.../current` → docker compose + PM2 reload → health check.

Runner setup: [Self-hosted runner](../vps-started/02-self-hosted-runner.md).

### 5.2 GitHub monorepo setup

Full step-by-step for **both** environments on all three repos: **[02-github-monorepos.md](02-github-monorepos.md)**.

Quick reference:

| Item | Dev | Prod |
|------|-----|------|
| Runner group | `plys-dev-runners` | `plys-prod-runners` |
| GitHub environment | `dev` | `production` (+ required reviewers) |
| Backend DB/Redis secrets | `DB_PASSWORD`, `REDIS_PASSWORD` → dev `/apps/.env.data` | Same keys → prod passwords in `.env.data` |
| Frontend secrets | `AUTH_SECRET` (+ webapps `PUBLIC_ENDPOINT_API_KEY`) | **Separate** prod values |
| Optional | `GHCR_PULL_TOKEN`, Google OAuth | Same pattern |
| Remove | `VPS_HOST`, `VPS_USER`, `VPS_SSH_KEY`, `VPS_SSH_PORT` | Same |

Per-repo lists: each monorepo `infra/env/secrets.list`.

### 5.3 Workflows

**plys-monorepo-webapps**

| Workflow | VPS path |
|----------|----------|
| `deploy-dev-{lonaos-app,ployos-app,lonaos-marketing,ployos-marketing}.yml` | `/apps/plys-webapps/dev` |
| `deploy-prod-*.yml` (manual) | `/apps/plys-webapps/prod` |

**plys-internal-hub**

| Workflow | VPS path |
|----------|----------|
| `deploy-dev-internal-{hub,admin-hub,task-reviewer}.yml` | `/apps/internal-hub-fe/dev` |
| `deploy-prod-*.yml` (manual) | `/apps/internal-hub-fe/prod` |

**plys-internal-hub-serivce-api**

| Workflow | VPS path |
|----------|----------|
| `deploy-dev.yml` | `/apps/internal-hub-be/dev` |
| `deploy-prod.yml` (manual) | `/apps/internal-hub-be/prod` |

---

## 6. Post-deploy verification

### Command guide — smoke script

**On VPS** (requires readable `/apps/.env.data` — see step 1.5.2 `chown`):

```bash
set -a && source /apps/.env.data && set +a

echo "=== Data layer ==="
docker exec postgres-dev psql -U plys_dev -d plys-db-dev -c 'SELECT 1' >/dev/null && echo "postgres-dev OK"
docker exec postgres-prod psql -U plys_prod -d plys-db -c 'SELECT 1' >/dev/null && echo "postgres-prod OK"
redis-cli -p 6380 -a "$REDIS_DEV_PASSWORD" --no-auth-warning PING
redis-cli -p 6379 -a "$REDIS_PROD_PASSWORD" --no-auth-warning PING

echo "=== API gateway ==="
curl -sf http://127.0.0.1:4001/api/v1/gateway/health && echo " gateway dev loopback OK"
curl -sf https://api-dev.plyshub.space/v1/gateway/health && echo " gateway dev public OK"

echo "=== FE health (loopback) ==="
curl -sf http://127.0.0.1:3001/api/health && echo " ployos-marketing dev OK"
curl -sf http://127.0.0.1:3101/api/health && echo " internal-hub dev OK"

echo "=== HTTPS samples ==="
curl -sI https://dev.ployos.com | head -1
curl -sI https://dev.plyshub.space | head -1

echo "=== Layout ==="
test ! -e /apps/environments && echo "/apps/environments absent OK"
ls /apps/plys-webapps/dev/current/docker-compose.yml && echo "webapps bundle present"

echo "=== Ports ==="
ss -tlnp | grep -E '3000|3100|3200|4000|4001' || true
```

### Checklist

- [ ] `dig` returns VPS IP for all hosts (grey cloud) — Section 2.5  
- [ ] HTTPS 200/302 on public hostnames  
- [ ] `curl -sf https://api.plyshub.space/v1/gateway/health`  
- [ ] `curl -sf https://api-dev.plyshub.space/v1/docs` (Swagger, dev)  
- [ ] `curl -sI "https://api-dev.plyshub.space/socket.io/?EIO=4&transport=polling"` not 404 (notifications WS)  
- [ ] OTP on `dev.plyshub.space`; cookies on `.plyshub.space`  
- [ ] Product auth on `app-dev.ployos.com` / `app-dev.lonaos.com`  
- [ ] Postgres `plys-db-dev` / `plys-db` reachable  
- [ ] Redis PING on 6380 / 6379  
- [ ] `/apps/environments` does not exist  

---

## Revert / reset

See **[Cleanup and reset](../vps-started/03-cleanup-and-reset.md)** — full cleanup, dev-only, prod-only, or **Postgres/Redis volume reset** without wiping nginx.

---

## Quick reference

```
dev.ployos.com      → :3001    ployos-marketing-dev
ployos.com          → :3000    ployos-marketing-prod
dev.lonaos.com        → :3011    lonaos-marketing-dev
lonaos.com            → :3010    lonaos-marketing-prod
app-dev.ployos.com  → :3021    ployos-app-dev
app.ployos.com      → :3020    ployos-app-prod
app-dev.lonaos.com    → :3031    lonaos-app-dev
app.lonaos.com        → :3030    lonaos-app-prod
dev.plyshub.space         → :3101    internal-hub-dev
plyshub.space             → :3100    internal-hub-prod
admin-dev.plyshub.space   → :3201    internal-admin-hub-dev
admin.plyshub.space       → :3200    internal-admin-hub-prod
review-dev.plyshub.space  → :3301    internal-task-reviewer-dev
review.plyshub.space      → :3300    internal-task-reviewer-prod
api-dev.plyshub.space/*   → :4001    rewrite → /api/* (REST only)
api-dev.plyshub.space/socket.io/* → :4001    no rewrite (notifications WS)
api.plyshub.space/*       → :4000    rewrite → /api/* (REST only)
api.plyshub.space/socket.io/*     → :4000    no rewrite (notifications WS)
db-dev.plyshub.space (example)    → :8080    Adminer (loopback; see vps-started/04-data-tools-adminer-redis.md)
redis-dev.plyshub.space (example) → :5540    Redis Insight
observe-dev.plyshub.space       → :5080    OpenObserve (loopback; see vps-started/06-monitoring-openobserve.md)
observe.plyshub.space           → :5080    OpenObserve (same stack on combined VPS)
```
