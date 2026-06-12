# VPS deployment — Production environment

**Track:** [deploy-prod](README.md) · [Prerequisites](../vps-started/01-prerequisites.md) first · [Docs index](../README.md)

Deploy **prod** stacks only on a **dedicated production VPS** (or follow [All-in-one deploy](../deploy-all-in-one-vps/01-deploy.md) for one host with both dev and prod).

**VPS setup (Node, Docker, nginx):** [Prerequisites](../vps-started/01-prerequisites.md) · **Self-hosted runner:** [Self-hosted runner](../vps-started/02-self-hosted-runner.md) · **DB/Redis GUI:** [Adminer + Redis Insight](../vps-started/04-data-tools-adminer-redis.md) · **Monitoring:** [OpenObserve](../vps-started/06-monitoring-openobserve.md) · **Cleanup / DB reset:** [Cleanup and reset](../vps-started/03-cleanup-and-reset.md)

**GitHub Environment:** `production` · **Branch:** `main` · **Monorepo secrets:** [02-github-monorepos.md](02-github-monorepos.md) · Prod workflows are **manual** (type `deploy` to confirm).

---

## Layout (prod VPS)

| Path | Repo |
|------|------|
| `/apps/plys-webapps/prod/current` | plys-monorepo-webapps |
| `/apps/internal-hub-fe/prod/current` | plys-internal-hub |
| `/apps/internal-hub-be/prod/current` | plys-internal-hub-service-api |
| `/apps/docker-compose.yml` | Postgres + Redis + Adminer + Redis Insight (prod only) |

---

## Domains (prod)

| FQDN | Port | Service |
|------|------|---------|
| `ployos.com` | 3000 | ployos-marketing |
| `lonaos.com` | 3010 | lonaos-marketing |
| `app.ployos.com` | 3020 | ployos-app |
| `app.lonaos.com` | 3030 | lonaos-app |
| `plyshub.space` | 3100 | internal-hub |
| `admin.plyshub.space` | 3200 | internal-admin-hub |
| `review.plyshub.space` | 3300 | internal-task-reviewer |
| `api.plyshub.space` | 4000 | api-gateway (REST `/*` → `/api/*`; Socket.IO `/socket.io/` + `/ws/notifications`) |

Cloudflare: **DNS only** for all records → prod VPS IP.

---

## 1. Clean VPS (prod)

**Warning:** destroys production data. Backup first — [Cleanup and reset](../vps-started/03-cleanup-and-reset.md) Section 1.

Full prod cleanup: **cleanup guide Section 5**. Reset prod DB only (empty `plys-db`, same volume name): **Section 6.2**.

---

## 2. Postgres + Redis (prod only)

Templates: [infra/README.md](../vps-started/infra/README.md) · [infra/docker-compose.data-prod.yml](../vps-started/infra/docker-compose.data-prod.yml) · [infra/env.data.prod.example](../vps-started/infra/env.data.prod.example)

**On VPS:**

```bash
sudo nano /apps/docker-compose.yml
# Paste full contents from docs/vps-started/infra/docker-compose.data-prod.yml, save.

export POSTGRES_PROD_PASSWORD="$(openssl rand -hex 24)"
export REDIS_PROD_PASSWORD="$(openssl rand -hex 24)"

sudo tee /apps/.env.data > /dev/null <<EOF
POSTGRES_PROD_PASSWORD=${POSTGRES_PROD_PASSWORD}
REDIS_PROD_PASSWORD=${REDIS_PROD_PASSWORD}
EOF
# Or paste docs/vps-started/infra/env.data.prod.example into nano and replace CHANGE_ME
sudo chown "$USER:$USER" /apps/.env.data
chmod 600 /apps/.env.data

cd /apps
docker compose --env-file /apps/.env.data config
docker compose --env-file /apps/.env.data up -d postgres-prod redis-prod adminer redisinsight
docker compose ps
```

Optional browser GUI: [Adminer + Redis Insight](../vps-started/04-data-tools-adminer-redis.md) (prefer SSH tunnel or IP allowlist on prod).

**Verify:**

```bash
set -a && source /apps/.env.data && set +a
docker exec postgres-prod psql -U plys_prod -d plys-db -c "SELECT current_user, current_database();"
redis-cli -p 6379 -a "$REDIS_PROD_PASSWORD" --no-auth-warning PING
```

### Data tools (optional)

Browser GUIs for Postgres and Redis — full guide: [Adminer + Redis Insight](../vps-started/04-data-tools-adminer-redis.md).

1. Containers are started in the `docker compose up` command above (`adminer`, `redisinsight`).
2. **Default (recommended):** SSH tunnel only — no public DNS for `db` / `redis` on prod:

   ```bash
   ssh -N -L 8080:127.0.0.1:8080 -L 5540:127.0.0.1:5540 USER@PROD_VPS
   ```

3. **If exposing publicly:** create `/etc/nginx/.htpasswd-data-tools`, apply nginx vhosts for `db.plyshub.space` and `redis.plyshub.space`, add `allow YOUR_OFFICE_IP; deny all;` inside each `server` block (data-tools guide §4.2), then add `-d db.plyshub.space -d redis.plyshub.space` to certbot in §4.3.

**GitHub:** configure all three monorepos — [02-github-monorepos.md](02-github-monorepos.md). Minimum for backend after §2 above:

| Secret | Value |
|--------|-------|
| `DB_PASSWORD` | same as `POSTGRES_PROD_PASSWORD` |
| `REDIS_PASSWORD` | same as `REDIS_PROD_PASSWORD` |

Org runners deploy on the VPS. Do **not** use `VPS_*` SSH secrets. Keep **production** environment protection rules on all three repos. See [Self-hosted runner](../vps-started/02-self-hosted-runner.md).

---

## 3. App directories

Created during [Prerequisites §4](../vps-started/01-prerequisites.md#4-create-apps-layout) (manual deploy) or [§3.5.4](../vps-started/01-prerequisites.md#354-create-deploy-directories-and-grant-runner-access) (self-hosted runner).

**On VPS** — verify (or create if missing):

```bash
sudo mkdir -p /apps/plys-webapps/prod/{current,logs}
sudo mkdir -p /apps/internal-hub-fe/prod/{current,logs}
sudo mkdir -p /apps/internal-hub-be/prod/{current,logs}

ls -la /apps/plys-webapps/prod/current /apps/internal-hub-fe/prod/current /apps/internal-hub-be/prod/current
```

Runner-owned host: ownership was set in Prerequisites §3.5.4 — do not `chown` to your SSH user unless you also deploy manually from that account.

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

# --- lonaos.com → :3010 (lonaos-marketing) ---
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

# --- app.lonaos.com → :3030 (lonaos-app) ---
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

# --- plyshub.space → :3100 (internal-hub) ---
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

# --- admin.plyshub.space → :3200 (internal-admin-hub) ---
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

# --- review.plyshub.space → :3300 (internal-task-reviewer) ---
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

# --- api.plyshub.space → :4000 (REST + Socket.IO /ws/notifications) ---
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

# --- enable + TLS ---
sudo nginx -t && sudo systemctl reload nginx
sudo certbot --nginx \
  -d ployos.com -d www.ployos.com -d app.ployos.com \
  -d lonaos.com -d app.lonaos.com \
  -d plyshub.space -d admin.plyshub.space -d review.plyshub.space \
  -d api.plyshub.space \
  -d observe.plyshub.space
sudo certbot renew --dry-run
```

**Optional data GUI:** `db.plyshub.space` / `redis.plyshub.space` — [Adminer + Redis Insight](../vps-started/04-data-tools-adminer-redis.md). Add `-d db.plyshub.space -d redis.plyshub.space` to certbot only if exposing publicly (prefer SSH tunnel on prod; use nginx `allow`/`deny`).

**Optional monitoring:** [OpenObserve](../vps-started/06-monitoring-openobserve.md). Deploy **Deploy monitoring — Prod** after app workflows (type `deploy` to confirm).

---

## 5. GitHub Actions on prod organization runner

**One-time:** org runner group `plys-prod-runners` + prod VPS runner — [Self-hosted runner](../vps-started/02-self-hosted-runner.md) §4–6.

Deploy jobs in all three monorepos use:

```yaml
runs-on:
  group: plys-prod-runners
  labels: [self-hosted, linux, x64, plys-prod-vps]
environment: production
```

Backend: `guard` + build on `ubuntu-latest`, deploy on org runner. Keep prod approval rules. No SSH deploy secrets — [§7](../vps-started/02-self-hosted-runner.md#7-workflow-changes-three-monorepos).

**Order (manual workflows, confirm `deploy`):**

1. `plys-internal-hub-service-api` — **Deploy Prod**
2. `plys-internal-hub` — Deploy Prod (×3)
3. `plys-monorepo-webapps` — Deploy Prod (×4)

**On VPS:**

```bash
curl -sf http://127.0.0.1:4000/api/v1/gateway/health
curl -sf https://api.plyshub.space/v1/gateway/health
curl -sI "https://api.plyshub.space/socket.io/?EIO=4&transport=polling" | head -3
```

Nginx details: [plys-internal-hub-serivce-api/docs/deployment/nginx-api-gateway.md](../plys-internal-hub-serivce-api/docs/deployment/nginx-api-gateway.md).

---

## 6. Verify

```bash
set -a && source /apps/.env.data && set +a
curl -sf http://127.0.0.1:4000/api/v1/gateway/health
curl -sI "http://127.0.0.1:4000/socket.io/?EIO=4&transport=polling" | head -3
curl -sf https://api.plyshub.space/v1/gateway/health
curl -sf https://ployos.com/api/health || curl -sI https://ployos.com | head -1
test ! -e /apps/environments && echo "OK"
ss -tlnp | grep -E '3000|3100|3200|4000' || true
```

---

## Revert (clean prod VPS again)

[Cleanup and reset](../vps-started/03-cleanup-and-reset.md) — Section 5 or 6.2 (DB reset). Then repeat from Section 2.
