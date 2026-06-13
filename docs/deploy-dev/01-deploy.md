# VPS deployment — Development environment

**Track:** [deploy-dev](README.md) · [Prerequisites](../vps-started/01-prerequisites.md) first · [Docs index](../README.md)

Deploy **dev** stacks only on a **dedicated dev VPS** (or follow [All-in-one deploy](../deploy-all-in-one-vps/01-deploy.md) for one host with both dev and prod).

**VPS setup (Node, Docker, nginx):** [Prerequisites](../vps-started/01-prerequisites.md) · **Self-hosted runner:** [Self-hosted runner](../vps-started/02-self-hosted-runner.md) · **DB/Redis GUI:** [Adminer + Redis Insight](../vps-started/04-data-tools-adminer-redis.md) · **Monitoring:** [OpenObserve](../vps-started/06-monitoring-openobserve.md) · **Cleanup / DB reset:** [Cleanup and reset](../vps-started/03-cleanup-and-reset.md)

**GitHub Environment:** `dev` · **Branch:** `develop` · **Monorepo secrets:** [02-github-monorepos.md](02-github-monorepos.md)

---

## Layout (dev VPS)

| Path | Repo |
|------|------|
| `/apps/plys-webapps/dev/current` | plys-monorepo-webapps |
| `/apps/internal-hub-fe/dev/current` | plys-internal-hub |
| `/apps/internal-hub-be/dev/current` | plys-internal-hub-service-api |
| `/apps/docker-compose.yml` | Postgres + Redis + Adminer + Redis Insight (dev only) |

---

## Domains (dev)

| FQDN | Port | Service |
|------|------|---------|
| `dev.ployos.com` | 3001 | ployos-marketing |
| `dev.lonaos.com` | 3011 | lonaos-marketing |
| `app-dev.ployos.com` | 3021 | ployos-app |
| `app-dev.lonaos.com` | 3031 | lonaos-app |
| `dev.plyshub.space` | 3101 | internal-hub |
| `admin-dev.plyshub.space` | 3201 | internal-admin-hub |
| `review-dev.plyshub.space` | 3301 | internal-task-reviewer |
| `api-dev.plyshub.space` | 4001 | api-gateway (REST `/*` → `/api/*`; Socket.IO `/socket.io/` + `/ws/notifications`) |

Cloudflare: **DNS only** (grey cloud) for all records → dev VPS IP.

---

## 1. Clean VPS (dev)

Full cleanup and **reset dev Postgres/Redis only** (remove volume, recreate): **[Cleanup and reset](../vps-started/03-cleanup-and-reset.md)** — Sections 4, 6.1, 7.1.

Quick dev wipe:

```bash
# Same as cleanup guide §4 — run on VPS
pm2 kill 2>/dev/null || true
cd /apps && docker compose --env-file /apps/.env.data down 2>/dev/null || true
docker rm -f postgres-dev redis-dev adminer redisinsight 2>/dev/null || true
docker volume rm apps_postgres-dev-data apps_redis-dev-data apps_redisinsight-data 2>/dev/null || true
sudo rm -rf /apps/plys-webapps /apps/internal-hub-fe /apps/internal-hub-be /apps/environments
sudo rm -f /apps/docker-compose.yml /apps/.env.data
```

---

## 2. Postgres + Redis (dev only)

Templates: [infra/README.md](../vps-started/infra/README.md) · [infra/docker-compose.data-dev.yml](../vps-started/infra/docker-compose.data-dev.yml) · [infra/env.data.dev.example](../vps-started/infra/env.data.dev.example)

**On VPS:**

```bash
sudo nano /apps/docker-compose.yml
# Paste full contents from docs/vps-started/infra/docker-compose.data-dev.yml, save.

export POSTGRES_DEV_PASSWORD="$(openssl rand -hex 24)"
export REDIS_DEV_PASSWORD="$(openssl rand -hex 24)"

sudo tee /apps/.env.data > /dev/null <<EOF
POSTGRES_DEV_PASSWORD=${POSTGRES_DEV_PASSWORD}
REDIS_DEV_PASSWORD=${REDIS_DEV_PASSWORD}
EOF
# Or paste docs/vps-started/infra/env.data.dev.example into nano and replace CHANGE_ME
sudo chown "$USER:$USER" /apps/.env.data
chmod 600 /apps/.env.data

cd /apps
docker compose --env-file /apps/.env.data config
docker compose --env-file /apps/.env.data up -d postgres-dev redis-dev adminer redisinsight
docker compose ps
```

Optional browser GUI (nginx or SSH tunnel): [Adminer + Redis Insight](../vps-started/04-data-tools-adminer-redis.md).

**Verify:**

```bash
set -a && source /apps/.env.data && set +a
docker exec postgres-dev psql -U plys_dev -d plys-db-dev -c "SELECT current_user, current_database();"
redis-cli -p 6380 -a "$REDIS_DEV_PASSWORD" --no-auth-warning PING
```

### Data tools (optional)

Browser GUIs for Postgres and Redis — full guide: [Adminer + Redis Insight](../vps-started/04-data-tools-adminer-redis.md).

1. Containers are started in the `docker compose up` command above (`adminer`, `redisinsight`).
2. Create nginx basic auth: `sudo htpasswd -c /etc/nginx/.htpasswd-data-tools YOUR_OPS_USER` (see data-tools guide §4).
3. Apply nginx vhosts for `db-dev.plyshub.space` → `:8080` and `redis-dev.plyshub.space` → `:5540` (data-tools guide §4.1).
4. Add `-d db-dev.plyshub.space -d redis-dev.plyshub.space` to the certbot command in §4.3 (or use SSH tunnel only and skip public DNS).

**GitHub:** configure all three monorepos before first deploy — [02-github-monorepos.md](02-github-monorepos.md). Minimum for backend after §2 above:

| Secret | Value |
|--------|-------|
| `DB_PASSWORD` | same as `POSTGRES_DEV_PASSWORD` |
| `REDIS_PASSWORD` | same as `REDIS_DEV_PASSWORD` |

With org runners, deploy jobs run on the VPS. Do **not** use `VPS_HOST`, `VPS_USER`, `VPS_SSH_KEY`, or `VPS_SSH_PORT`. See [Self-hosted runner](../vps-started/02-self-hosted-runner.md).

---

## 3. App directories

Created during [Prerequisites §4](../vps-started/01-prerequisites.md#4-create-apps-layout) (manual deploy) or [§3.5.4](../vps-started/01-prerequisites.md#354-create-deploy-directories-and-grant-runner-access) (self-hosted runner).

**On VPS** — verify (or create if missing):

```bash
sudo mkdir -p /apps/plys-webapps/dev/{current,logs}
sudo mkdir -p /apps/internal-hub-fe/dev/{current,logs}
sudo mkdir -p /apps/internal-hub-be/dev/{current,logs}

ls -la /apps/plys-webapps/dev/current /apps/internal-hub-fe/dev/current /apps/internal-hub-be/dev/current
```

Runner-owned host: ownership was set in Prerequisites §3.5.4 — do not `chown` to your SSH user unless you also deploy manually from that account.

---

## 4. Nginx (dev hostnames)

**Prerequisites on VPS:** `sudo apt install -y nginx certbot python3-certbot-nginx`

**On VPS** — run the full block below (proxy buffers + one `sites-available` file per dev FQDN; API uses `/api` rewrite). Ports match the table in Section “Domains (dev)”.

```bash
# --- proxy buffers (Next.js / large Set-Cookie response headers) ---
sudo tee /etc/nginx/conf.d/proxy-buffers.conf > /dev/null <<'NGINX'
proxy_buffer_size 128k;
proxy_buffers 4 256k;
proxy_busy_buffers_size 256k;
NGINX

# --- dev.ployos.com → :3001 (ployos-marketing) ---
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
        proxy_buffer_size 128k;
        proxy_buffers 4 256k;
        proxy_busy_buffers_size 256k;
        proxy_read_timeout 120s;
    }
}
NGINX
sudo ln -sf /etc/nginx/sites-available/dev.ployos.com /etc/nginx/sites-enabled/

# --- dev.lonaos.com → :3011 (lonaos-marketing) ---
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
        proxy_buffer_size 128k;
        proxy_buffers 4 256k;
        proxy_busy_buffers_size 256k;
        proxy_read_timeout 120s;
    }
}
NGINX
sudo ln -sf /etc/nginx/sites-available/dev.lonaos.com /etc/nginx/sites-enabled/

# --- app-dev.ployos.com → :3021 (ployos-app) ---
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
        proxy_buffer_size 128k;
        proxy_buffers 4 256k;
        proxy_busy_buffers_size 256k;
        proxy_read_timeout 120s;
    }
}
NGINX
sudo ln -sf /etc/nginx/sites-available/app-dev.ployos.com /etc/nginx/sites-enabled/

# --- app-dev.lonaos.com → :3031 (lonaos-app) ---
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
        proxy_buffer_size 128k;
        proxy_buffers 4 256k;
        proxy_busy_buffers_size 256k;
        proxy_read_timeout 120s;
    }
}
NGINX
sudo ln -sf /etc/nginx/sites-available/app-dev.lonaos.com /etc/nginx/sites-enabled/

# --- dev.plyshub.space → :3101 (internal-hub) ---
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
        proxy_buffer_size 128k;
        proxy_buffers 4 256k;
        proxy_busy_buffers_size 256k;
        proxy_read_timeout 120s;
    }
}
NGINX
sudo ln -sf /etc/nginx/sites-available/dev.plyshub.space /etc/nginx/sites-enabled/

# --- admin-dev.plyshub.space → :3201 (internal-admin-hub) ---
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
        proxy_buffer_size 128k;
        proxy_buffers 4 256k;
        proxy_busy_buffers_size 256k;
        proxy_read_timeout 120s;
    }
}
NGINX
sudo ln -sf /etc/nginx/sites-available/admin-dev.plyshub.space /etc/nginx/sites-enabled/

# --- review-dev.plyshub.space → :3301 (internal-task-reviewer) ---
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
        proxy_buffer_size 128k;
        proxy_buffers 4 256k;
        proxy_busy_buffers_size 256k;
        proxy_read_timeout 120s;
    }
}
NGINX
sudo ln -sf /etc/nginx/sites-available/review-dev.plyshub.space /etc/nginx/sites-enabled/

# --- api-dev.plyshub.space → :4001 (REST + Socket.IO /ws/notifications) ---
sudo tee /etc/nginx/sites-available/api-dev.plyshub.space > /dev/null <<'NGINX'
server {
    listen 80;
    server_name api-dev.plyshub.space;

    # Socket.IO engine for namespace /ws/notifications — no /api rewrite
    location /socket.io/ {
        proxy_pass http://127.0.0.1:4001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_buffer_size 128k;
        proxy_buffers 4 256k;
        proxy_busy_buffers_size 256k;
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
        proxy_buffer_size 128k;
        proxy_buffers 4 256k;
        proxy_busy_buffers_size 256k;
        proxy_read_timeout 86400s;
        proxy_send_timeout 86400s;
    }

    # REST — public URL without /api prefix
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
        proxy_buffer_size 128k;
        proxy_buffers 4 256k;
        proxy_busy_buffers_size 256k;
        proxy_cache_bypass $http_upgrade;
        proxy_read_timeout 60s;
    }
}
NGINX
sudo ln -sf /etc/nginx/sites-available/api-dev.plyshub.space /etc/nginx/sites-enabled/

# --- enable + TLS ---
sudo nginx -t && sudo systemctl reload nginx
sudo certbot --nginx \
  -d dev.ployos.com -d app-dev.ployos.com \
  -d dev.lonaos.com -d app-dev.lonaos.com \
  -d dev.plyshub.space -d admin-dev.plyshub.space -d review-dev.plyshub.space \
  -d api-dev.plyshub.space \
  -d db-dev.plyshub.space -d redis-dev.plyshub.space \
  -d observe-dev.plyshub.space
sudo certbot renew --dry-run
```

**Optional data GUI:** configure nginx first — [Adminer + Redis Insight](../vps-started/04-data-tools-adminer-redis.md) §4. Omit `db-dev` / `redis-dev` from certbot if using SSH tunnel only.

**Optional monitoring:** configure nginx for `observe-dev.plyshub.space` — [OpenObserve](../vps-started/06-monitoring-openobserve.md). Deploy after app workflows so PM2 log dirs exist.

---

## 5. GitHub Actions on dev organization runner

**One-time:** org runner group `plys-dev-runners` + dev VPS runner — [Self-hosted runner](../vps-started/02-self-hosted-runner.md) §4–6.

Deploy jobs in all three monorepos use:

```yaml
runs-on:
  group: plys-dev-runners
  labels: [self-hosted, linux, x64, plys-dev-vps]
environment: dev
```

Backend (`plys-internal-hub-service-api`): build on `ubuntu-latest`, deploy job on org runner. Frontend repos: full job on org runner. No `VPS_HOST` / SSH secrets — see [§7](../vps-started/02-self-hosted-runner.md#7-workflow-changes-three-monorepos).

**Order (GitHub UI → run workflow):**

1. `plys-internal-hub-service-api` — **Deploy Dev**
2. `plys-internal-hub` — Deploy Dev (×3 apps)
3. `plys-monorepo-webapps` — Deploy Dev (×4 apps)

**On VPS** — after backend deploy:

```bash
curl -sf http://127.0.0.1:4001/api/v1/gateway/health
curl -sf https://api-dev.plyshub.space/v1/gateway/health
curl -sI "https://api-dev.plyshub.space/socket.io/?EIO=4&transport=polling" | head -3
```

Nginx details: [plys-internal-hub-serivce-api/docs/deployment/nginx-api-gateway.md](../plys-internal-hub-serivce-api/docs/deployment/nginx-api-gateway.md).

---

## 6. Verify

```bash
set -a && source /apps/.env.data && set +a
curl -sf http://127.0.0.1:4001/api/v1/gateway/health
curl -sI "http://127.0.0.1:4001/socket.io/?EIO=4&transport=polling" | head -3
curl -sf http://127.0.0.1:3001/api/health
curl -sf https://dev.plyshub.space/api/health
test ! -e /apps/environments && echo "OK"
```

---

## Revert (clean dev VPS again)

[Cleanup and reset](../vps-started/03-cleanup-and-reset.md) — Section 4 (full dev cleanup) or Section 6.1 (DB only). Then repeat this guide from Section 2.
