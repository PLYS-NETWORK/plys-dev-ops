# VPS deployment — Production environment

Deploy **prod** stacks only on a **dedicated production VPS** (or follow [vps-end-to-end-deployment.md](vps-end-to-end-deployment.md) for one host with both dev and prod).

**Monitoring:** [vps-monitoring-openobserve.md](vps-monitoring-openobserve.md) · **DB/Redis GUI:** [vps-data-tools-adminer-redis-insight.md](vps-data-tools-adminer-redis-insight.md) · **Cleanup / DB reset:** [vps-cleanup-and-reset.md](vps-cleanup-and-reset.md)

**GitHub Environment:** `production` · **Branch:** `main` · Prod workflows are **manual** (type `deploy` to confirm).

---

## Layout (prod VPS)

| Path | Repo |
|------|------|
| `/apps/plys-webapps/prod/current` | plys-monorepo-webapps |
| `/apps/internal-hub-fe/prod/current` | plys-internal-hub |
| `/apps/internal-hub-be/prod/current` | plys-internal-hub-serivce-api |
| `/apps/docker-compose.yml` | Postgres + Redis + Adminer + Redis Insight (prod only) |

---

## Domains (prod)

| FQDN | Port | Service |
|------|------|---------|
| `ployos.com` | 3000 | ployos-marketing |
| `lona.run` | 3010 | lonaos-marketing |
| `app.ployos.com` | 3020 | ployos-app |
| `app.lona.run` | 3030 | lonaos-app |
| `lona.my` | 3100 | internal-hub |
| `admin.lona.my` | 3200 | internal-admin-hub |
| `review.lona.my` | 3300 | internal-task-reviewer |
| `api.lona.my` | 4000 | api-gateway (REST `/*` → `/api/*`; Socket.IO `/socket.io/` + `/ws/notifications`) |

Cloudflare: **DNS only** for all records → prod VPS IP.

---

## 1. Clean VPS (prod)

**Warning:** destroys production data. Backup first — [vps-cleanup-and-reset.md](vps-cleanup-and-reset.md) Section 1.

Full prod cleanup: **cleanup guide Section 5**. Reset prod DB only (empty `plys-db`, same volume name): **Section 6.2**.

---

## 2. Postgres + Redis (prod only)

Templates: [infra/README.md](infra/README.md) · [infra/docker-compose.data-prod.yml](infra/docker-compose.data-prod.yml) · [infra/env.data.prod.example](infra/env.data.prod.example)

**On VPS:**

```bash
sudo nano /apps/docker-compose.yml
# Paste full contents from docs/infra/docker-compose.data-prod.yml, save.

export POSTGRES_PROD_PASSWORD="$(openssl rand -hex 24)"
export REDIS_PROD_PASSWORD="$(openssl rand -hex 24)"

sudo tee /apps/.env.data > /dev/null <<EOF
POSTGRES_PROD_PASSWORD=${POSTGRES_PROD_PASSWORD}
REDIS_PROD_PASSWORD=${REDIS_PROD_PASSWORD}
EOF
# Or paste docs/infra/env.data.prod.example into nano and replace CHANGE_ME
sudo chown "$USER:$USER" /apps/.env.data
chmod 600 /apps/.env.data

cd /apps
docker compose --env-file /apps/.env.data config
docker compose --env-file /apps/.env.data up -d postgres-prod redis-prod adminer redisinsight
docker compose ps
```

Optional browser GUI: [vps-data-tools-adminer-redis-insight.md](vps-data-tools-adminer-redis-insight.md) (prefer SSH tunnel or IP allowlist on prod).

**Verify:**

```bash
set -a && source /apps/.env.data && set +a
docker exec postgres-prod psql -U plys_prod -d plys-db -c "SELECT current_user, current_database();"
redis-cli -p 6379 -a "$REDIS_PROD_PASSWORD" --no-auth-warning PING
```

**GitHub → `plys-internal-hub-serivce-api` → Environment `production`:**

| Secret | Value |
|--------|-------|
| `DB_PASSWORD` | same as `POSTGRES_PROD_PASSWORD` |
| `REDIS_PASSWORD` | same as `REDIS_PROD_PASSWORD` |
| `VPS_*`, `GHCR_PULL_TOKEN` | this prod VPS |

Use **production** environment (and protection rules) on all three monorepos for prod deploys.

---

## 3. App directories

**On VPS:**

```bash
mkdir -p /apps/plys-webapps/prod/{current,logs}
mkdir -p /apps/internal-hub-fe/prod/{current,logs}
mkdir -p /apps/internal-hub-be/prod/{current,logs}
sudo chown -R "$USER:$USER" /apps/plys-webapps /apps/internal-hub-fe /apps/internal-hub-be
```

---

## 4. Nginx (prod hostnames)

**Prerequisites on VPS:** `sudo apt install -y nginx certbot python3-certbot-nginx`

**On VPS** — run the full block below (one file per prod FQDN). Ports match Section “Domains (prod)”.

```bash
# --- ployos.com + www → :3000 (ployos-marketing) ---
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

# --- lona.run → :3010 (lonaos-marketing) ---
sudo tee /etc/nginx/sites-available/lona.run > /dev/null <<'NGINX'
server {
    listen 80;
    server_name lona.run;
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
sudo ln -sf /etc/nginx/sites-available/lona.run /etc/nginx/sites-enabled/

# --- app.ployos.com → :3020 (ployos-app) ---
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

# --- app.lona.run → :3030 (lonaos-app) ---
sudo tee /etc/nginx/sites-available/app.lona.run > /dev/null <<'NGINX'
server {
    listen 80;
    server_name app.lona.run;
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
sudo ln -sf /etc/nginx/sites-available/app.lona.run /etc/nginx/sites-enabled/

# --- lona.my → :3100 (internal-hub) ---
sudo tee /etc/nginx/sites-available/lona.my > /dev/null <<'NGINX'
server {
    listen 80;
    server_name lona.my;
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
sudo ln -sf /etc/nginx/sites-available/lona.my /etc/nginx/sites-enabled/

# --- admin.lona.my → :3200 (internal-admin-hub) ---
sudo tee /etc/nginx/sites-available/admin.lona.my > /dev/null <<'NGINX'
server {
    listen 80;
    server_name admin.lona.my;
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
sudo ln -sf /etc/nginx/sites-available/admin.lona.my /etc/nginx/sites-enabled/

# --- review.lona.my → :3300 (internal-task-reviewer) ---
sudo tee /etc/nginx/sites-available/review.lona.my > /dev/null <<'NGINX'
server {
    listen 80;
    server_name review.lona.my;
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
sudo ln -sf /etc/nginx/sites-available/review.lona.my /etc/nginx/sites-enabled/

# --- api.lona.my → :4000 (REST + Socket.IO /ws/notifications) ---
sudo tee /etc/nginx/sites-available/api.lona.my > /dev/null <<'NGINX'
server {
    listen 80;
    server_name api.lona.my;

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
sudo ln -sf /etc/nginx/sites-available/api.lona.my /etc/nginx/sites-enabled/

# --- enable + TLS ---
sudo nginx -t && sudo systemctl reload nginx
sudo certbot --nginx \
  -d ployos.com -d www.ployos.com -d app.ployos.com \
  -d lona.run -d app.lona.run \
  -d lona.my -d admin.lona.my -d review.lona.my \
  -d api.lona.my
sudo certbot renew --dry-run
```

**Optional monitoring** on the prod VPS: [vps-monitoring-openobserve.md](vps-monitoring-openobserve.md) (`observe.lona.my` → `:5080`).

**Optional data GUI:** `db.lona.my` / `redis.lona.my` — [vps-data-tools-adminer-redis-insight.md](vps-data-tools-adminer-redis-insight.md). Add `-d db.lona.my -d redis.lona.my` to certbot only if exposing publicly (prefer SSH tunnel on prod; use nginx `allow`/`deny`).

---

## 5. GitHub Actions (prod only)

**On VPS:**

```bash
echo "$GHCR_PULL_TOKEN" | docker login ghcr.io -u YOUR_GITHUB_USER --password-stdin
```

**Order (manual workflows, confirm `deploy`):**

1. `plys-internal-hub-serivce-api` — **Deploy Prod**
2. `plys-internal-hub` — Deploy Prod (×3)
3. `plys-monorepo-webapps` — Deploy Prod (×4)

**On VPS:**

```bash
curl -sf http://127.0.0.1:4000/api/v1/gateway/health
curl -sf https://api.lona.my/v1/gateway/health
curl -sI "https://api.lona.my/socket.io/?EIO=4&transport=polling" | head -3
```

Nginx details: [plys-internal-hub-serivce-api/docs/deployment/nginx-api-gateway.md](../plys-internal-hub-serivce-api/docs/deployment/nginx-api-gateway.md).

---

## 6. Verify

```bash
set -a && source /apps/.env.data && set +a
curl -sf http://127.0.0.1:4000/api/v1/gateway/health
curl -sI "http://127.0.0.1:4000/socket.io/?EIO=4&transport=polling" | head -3
curl -sf https://api.lona.my/v1/gateway/health
curl -sf https://ployos.com/api/health || curl -sI https://ployos.com | head -1
test ! -e /apps/environments && echo "OK"
ss -tlnp | grep -E '3000|3100|3200|4000' || true
```

---

## Revert (clean prod VPS again)

[vps-cleanup-and-reset.md](vps-cleanup-and-reset.md) — Section 5 or 6.2 (DB reset). Then repeat from Section 2.
