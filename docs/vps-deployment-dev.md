# VPS deployment — Development environment

Deploy **dev** stacks only on a **dedicated dev VPS** (or follow [vps-end-to-end-deployment.md](vps-end-to-end-deployment.md) for one host with both dev and prod).

**Monitoring:** [vps-monitoring-openobserve.md](vps-monitoring-openobserve.md) · **DB/Redis GUI:** [vps-data-tools-adminer-redis-insight.md](vps-data-tools-adminer-redis-insight.md) · **Cleanup / DB reset:** [vps-cleanup-and-reset.md](vps-cleanup-and-reset.md)

**GitHub Environment:** `dev` · **Branch:** `develop`

---

## Layout (dev VPS)

| Path | Repo |
|------|------|
| `/apps/plys-webapps/dev/current` | plys-monorepo-webapps |
| `/apps/internal-hub-fe/dev/current` | plys-internal-hub |
| `/apps/internal-hub-be/dev/current` | plys-internal-hub-serivce-api |
| `/apps/docker-compose.yml` | Postgres + Redis + Adminer + Redis Insight (dev only) |

---

## Domains (dev)

| FQDN | Port | Service |
|------|------|---------|
| `dev.ployos.com` | 3001 | ployos-marketing |
| `dev.lona.run` | 3011 | lonaos-marketing |
| `app-dev.ployos.com` | 3021 | ployos-app |
| `app-dev.lona.run` | 3031 | lonaos-app |
| `dev.lona.my` | 3101 | internal-hub |
| `admin-dev.lona.my` | 3201 | internal-admin-hub |
| `review-dev.lona.my` | 3301 | internal-task-reviewer |
| `api-dev.lona.my` | 4001 | api-gateway (REST `/*` → `/api/*`; Socket.IO `/socket.io/` + `/ws/notifications`) |

Cloudflare: **DNS only** (grey cloud) for all records → dev VPS IP.

---

## 1. Clean VPS (dev)

Full cleanup and **reset dev Postgres/Redis only** (remove volume, recreate): **[vps-cleanup-and-reset.md](vps-cleanup-and-reset.md)** — Sections 4, 6.1, 7.1.

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

Templates: [infra/README.md](infra/README.md) · [infra/docker-compose.data-dev.yml](infra/docker-compose.data-dev.yml) · [infra/env.data.dev.example](infra/env.data.dev.example)

**On VPS:**

```bash
sudo nano /apps/docker-compose.yml
# Paste full contents from docs/infra/docker-compose.data-dev.yml, save.

export POSTGRES_DEV_PASSWORD="$(openssl rand -hex 24)"
export REDIS_DEV_PASSWORD="$(openssl rand -hex 24)"

sudo tee /apps/.env.data > /dev/null <<EOF
POSTGRES_DEV_PASSWORD=${POSTGRES_DEV_PASSWORD}
REDIS_DEV_PASSWORD=${REDIS_DEV_PASSWORD}
EOF
# Or paste docs/infra/env.data.dev.example into nano and replace CHANGE_ME
sudo chown "$USER:$USER" /apps/.env.data
chmod 600 /apps/.env.data

cd /apps
docker compose --env-file /apps/.env.data config
docker compose --env-file /apps/.env.data up -d postgres-dev redis-dev adminer redisinsight
docker compose ps
```

Optional browser GUI (nginx or SSH tunnel): [vps-data-tools-adminer-redis-insight.md](vps-data-tools-adminer-redis-insight.md).

**Verify:**

```bash
set -a && source /apps/.env.data && set +a
docker exec postgres-dev psql -U plys_dev -d plys-db-dev -c "SELECT current_user, current_database();"
redis-cli -p 6380 -a "$REDIS_DEV_PASSWORD" --no-auth-warning PING
```

**GitHub → `plys-internal-hub-serivce-api` → Environment `dev`:**

| Secret | Value |
|--------|-------|
| `DB_PASSWORD` | same as `POSTGRES_DEV_PASSWORD` |
| `REDIS_PASSWORD` | same as `REDIS_DEV_PASSWORD` |
| `VPS_HOST`, `VPS_USER`, `VPS_SSH_KEY`, `VPS_SSH_PORT`, `GHCR_PULL_TOKEN` | this dev VPS |

Same `VPS_*` + `GHCR_PULL_TOKEN` on **dev** environments in webapps and internal-hub repos.

---

## 3. App directories

**On VPS:**

```bash
mkdir -p /apps/plys-webapps/dev/{current,logs}
mkdir -p /apps/internal-hub-fe/dev/{current,logs}
mkdir -p /apps/internal-hub-be/dev/{current,logs}
sudo chown -R "$USER:$USER" /apps/plys-webapps /apps/internal-hub-fe /apps/internal-hub-be
```

---

## 4. Nginx (dev hostnames)

**Prerequisites on VPS:** `sudo apt install -y nginx certbot python3-certbot-nginx`

**On VPS** — run the full block below (one `sites-available` file per dev FQDN; API uses `/api` rewrite). Ports match the table in Section “Domains (dev)”.

```bash
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
        proxy_read_timeout 120s;
    }
}
NGINX
sudo ln -sf /etc/nginx/sites-available/dev.ployos.com /etc/nginx/sites-enabled/

# --- dev.lona.run → :3011 (lonaos-marketing) ---
sudo tee /etc/nginx/sites-available/dev.lona.run > /dev/null <<'NGINX'
server {
    listen 80;
    server_name dev.lona.run;
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
sudo ln -sf /etc/nginx/sites-available/dev.lona.run /etc/nginx/sites-enabled/

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
        proxy_read_timeout 120s;
    }
}
NGINX
sudo ln -sf /etc/nginx/sites-available/app-dev.ployos.com /etc/nginx/sites-enabled/

# --- app-dev.lona.run → :3031 (lonaos-app) ---
sudo tee /etc/nginx/sites-available/app-dev.lona.run > /dev/null <<'NGINX'
server {
    listen 80;
    server_name app-dev.lona.run;
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
sudo ln -sf /etc/nginx/sites-available/app-dev.lona.run /etc/nginx/sites-enabled/

# --- dev.lona.my → :3101 (internal-hub) ---
sudo tee /etc/nginx/sites-available/dev.lona.my > /dev/null <<'NGINX'
server {
    listen 80;
    server_name dev.lona.my;
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
sudo ln -sf /etc/nginx/sites-available/dev.lona.my /etc/nginx/sites-enabled/

# --- admin-dev.lona.my → :3201 (internal-admin-hub) ---
sudo tee /etc/nginx/sites-available/admin-dev.lona.my > /dev/null <<'NGINX'
server {
    listen 80;
    server_name admin-dev.lona.my;
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
sudo ln -sf /etc/nginx/sites-available/admin-dev.lona.my /etc/nginx/sites-enabled/

# --- review-dev.lona.my → :3301 (internal-task-reviewer) ---
sudo tee /etc/nginx/sites-available/review-dev.lona.my > /dev/null <<'NGINX'
server {
    listen 80;
    server_name review-dev.lona.my;
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
sudo ln -sf /etc/nginx/sites-available/review-dev.lona.my /etc/nginx/sites-enabled/

# --- api-dev.lona.my → :4001 (REST + Socket.IO /ws/notifications) ---
sudo tee /etc/nginx/sites-available/api-dev.lona.my > /dev/null <<'NGINX'
server {
    listen 80;
    server_name api-dev.lona.my;

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
        proxy_cache_bypass $http_upgrade;
        proxy_read_timeout 60s;
    }
}
NGINX
sudo ln -sf /etc/nginx/sites-available/api-dev.lona.my /etc/nginx/sites-enabled/

# --- enable + TLS ---
sudo nginx -t && sudo systemctl reload nginx
sudo certbot --nginx \
  -d dev.ployos.com -d app-dev.ployos.com \
  -d dev.lona.run -d app-dev.lona.run \
  -d dev.lona.my -d admin-dev.lona.my -d review-dev.lona.my \
  -d api-dev.lona.my \
  -d db-dev.lona.my -d redis-dev.lona.my
sudo certbot renew --dry-run
```

**Optional monitoring** on the dev VPS: [vps-monitoring-openobserve.md](vps-monitoring-openobserve.md) (OpenObserve `:5080` loopback → `observe-dev.lona.my`; do not use `:3100`/`:3200` for monitoring — reserved for internal-hub FE on combined hosts).

**Optional data GUI:** configure nginx first — [vps-data-tools-adminer-redis-insight.md](vps-data-tools-adminer-redis-insight.md) §4. Omit `db-dev` / `redis-dev` from certbot if using SSH tunnel only.

---

## 5. GitHub Actions (dev only)

**On VPS:**

```bash
echo "$GHCR_PULL_TOKEN" | docker login ghcr.io -u YOUR_GITHUB_USER --password-stdin
```

**Order (GitHub UI → run workflow):**

1. `plys-internal-hub-serivce-api` — **Deploy Dev**
2. `plys-internal-hub` — Deploy Dev (×3 apps)
3. `plys-monorepo-webapps` — Deploy Dev (×4 apps)

**On VPS** — after backend deploy:

```bash
curl -sf http://127.0.0.1:4001/api/v1/gateway/health
curl -sf https://api-dev.lona.my/v1/gateway/health
curl -sI "https://api-dev.lona.my/socket.io/?EIO=4&transport=polling" | head -3
```

Nginx details: [plys-internal-hub-serivce-api/docs/deployment/nginx-api-gateway.md](../plys-internal-hub-serivce-api/docs/deployment/nginx-api-gateway.md).

---

## 6. Verify

```bash
set -a && source /apps/.env.data && set +a
curl -sf http://127.0.0.1:4001/api/v1/gateway/health
curl -sI "http://127.0.0.1:4001/socket.io/?EIO=4&transport=polling" | head -3
curl -sf http://127.0.0.1:3001/api/health
curl -sf https://dev.lona.my/api/health
test ! -e /apps/environments && echo "OK"
```

---

## Revert (clean dev VPS again)

[vps-cleanup-and-reset.md](vps-cleanup-and-reset.md) — Section 4 (full dev cleanup) or Section 6.1 (DB only). Then repeat this guide from Section 2.
