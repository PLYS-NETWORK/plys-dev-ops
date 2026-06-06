# VPS — Adminer + Redis Insight (Postgres / Redis GUI)

Browser UIs for Postgres (**Adminer**) and Redis (**Redis Insight**) on the VPS. Containers bind **localhost only**; expose via **nginx + HTTPS + basic auth** (recommended) or **SSH tunnel** (no public DNS).

Templates: [infra/docker-compose.data-dev.yml](infra/docker-compose.data-dev.yml), [infra/docker-compose.data-prod.yml](infra/docker-compose.data-prod.yml), [infra/docker-compose.data.yml](infra/docker-compose.data.yml) (already include `adminer` and `redisinsight`).

Related: [vps-deployment-dev.md](vps-deployment-dev.md) · [vps-deployment-prod.md](vps-deployment-prod.md) · [vps-end-to-end-deployment.md](vps-end-to-end-deployment.md) · [infra/README.md](infra/README.md)

---

## Ports (loopback)

| Service | Host bind | Notes |
|---------|-----------|--------|
| Adminer | `127.0.0.1:8080` | Do not use `admin*.lona.my` — reserved for **internal-admin-hub** app |
| Redis Insight | `127.0.0.1:5540` | Avoid `3100`/`3200` on combined VPS (internal-hub FE) |

---

## Domain placeholders

Set on the VPS before nginx/Certbot (replace zone if needed):

```bash
# Dev-only VPS examples
export DB_GUI_HOST="db-dev.lona.my"
export REDIS_GUI_HOST="redis-dev.lona.my"

# Prod-only VPS examples
export DB_GUI_HOST="db.lona.my"
export REDIS_GUI_HOST="redis.lona.my"

# Combined VPS: use dev hostnames above on the same certbot run as app dev hosts,
# and add db.lona.my + redis.lona.my for prod (see §4.3 in vps-end-to-end-deployment.md).
```

**Cloudflare:** A records → VPS IP, **DNS only** (grey cloud).

---

## 1. Start containers

Included in `/apps/docker-compose.yml` from [infra/](infra/). After Postgres/Redis are up:

**Dev-only VPS:**

```bash
cd /apps
docker compose --env-file /apps/.env.data up -d postgres-dev redis-dev adminer redisinsight
docker compose ps
```

**Prod-only VPS:**

```bash
cd /apps
docker compose --env-file /apps/.env.data up -d postgres-prod redis-prod adminer redisinsight
docker compose ps
```

**Combined VPS:**

```bash
cd /apps
docker compose --env-file /apps/.env.data up -d
docker compose ps
```

**Verify loopback (on VPS):**

```bash
curl -sI http://127.0.0.1:8080 | head -1
curl -sI http://127.0.0.1:5540 | head -1
```

---

## 2. Adminer — login

Open Adminer (tunnel or HTTPS vhost). **System:** PostgreSQL.

| VPS type | Server (hostname) | User | Database | Password |
|----------|-------------------|------|----------|----------|
| Dev-only | `postgres-dev` | `plys_dev` | `plys-db-dev` | `POSTGRES_DEV_PASSWORD` from `/apps/.env.data` |
| Prod-only | `postgres-prod` | `plys_prod` | `plys-db` | `POSTGRES_PROD_PASSWORD` |
| Combined | `postgres-dev` or `postgres-prod` | `plys_dev` / `plys_prod` | `plys-db-dev` / `plys-db` | matching env key |

Use Docker **service names** as Server (not `127.0.0.1`) when Adminer runs in the same compose project. Port inside Adminer form: **5432** (container port).

```bash
set -a && source /apps/.env.data && set +a
# show dev password only on dev/combined VPS
echo "POSTGRES_DEV_PASSWORD is set: ${POSTGRES_DEV_PASSWORD:+yes}"
```

---

## 3. Redis Insight — first connection

1. Open Redis Insight UI.
2. **Add Redis database** → **Add database manually**.
3. **Host:** `redis-dev` (dev/combined dev) or `redis-prod` (prod/combined prod) — Docker service name.
4. **Port:** `6379`
5. **Username:** leave empty
6. **Password:** `REDIS_DEV_PASSWORD` or `REDIS_PROD_PASSWORD` from `/apps/.env.data`
7. **TLS:** off

Key prefixes in app env (for filtering): `app:dev:` / `app:prod:`, `throttle:dev:` / `throttle:prod:` (see service-api `infra/env/.env.dev`).

---

## 4. Nginx + TLS + basic auth (public GUI)

Create one htpasswd file for both tools:

```bash
sudo apt-get install -y apache2-utils
sudo htpasswd -c /etc/nginx/.htpasswd-data-tools YOUR_OPS_USER
# add more users: sudo htpasswd /etc/nginx/.htpasswd-data-tools another_user
```

### 4.1 Dev hostnames

**On VPS** — set `DB_GUI_HOST` / `REDIS_GUI_HOST` (§ placeholders), then:

```bash
export DB_GUI_HOST="${DB_GUI_HOST:-db-dev.lona.my}"
export REDIS_GUI_HOST="${REDIS_GUI_HOST:-redis-dev.lona.my}"

sudo tee /etc/nginx/sites-available/${DB_GUI_HOST} > /dev/null <<NGINX
server {
    listen 80;
    server_name ${DB_GUI_HOST};

    auth_basic "Data tools";
    auth_basic_user_file /etc/nginx/.htpasswd-data-tools;

    location / {
        proxy_pass http://127.0.0.1:8080;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }
}
NGINX
sudo ln -sf /etc/nginx/sites-available/${DB_GUI_HOST} /etc/nginx/sites-enabled/

sudo tee /etc/nginx/sites-available/${REDIS_GUI_HOST} > /dev/null <<NGINX
server {
    listen 80;
    server_name ${REDIS_GUI_HOST};

    auth_basic "Data tools";
    auth_basic_user_file /etc/nginx/.htpasswd-data-tools;

    location / {
        proxy_pass http://127.0.0.1:5540;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }
}
NGINX
sudo ln -sf /etc/nginx/sites-available/${REDIS_GUI_HOST} /etc/nginx/sites-enabled/
```

### 4.2 Prod hostnames

Same block with `db.lona.my` / `redis.lona.my` (or your prod zone). **Restrict prod** with nginx `allow YOUR_OFFICE_IP; deny all;` inside the `server` block if the VPS is production.

### 4.3 Certbot

Add GUI hosts to your existing certbot command, e.g. dev VPS:

```bash
sudo nginx -t && sudo systemctl reload nginx
sudo certbot --nginx -d db-dev.lona.my -d redis-dev.lona.my
```

Combined VPS: include all app hosts **plus** `db-dev`, `redis-dev`, `db`, `redis` in one certbot run (see [vps-end-to-end-deployment.md](vps-end-to-end-deployment.md) §4.3).

---

## 5. SSH tunnel (no public DNS)

From your laptop:

```bash
ssh -N -L 8080:127.0.0.1:8080 -L 5540:127.0.0.1:5540 USER@DEV_VPS
```

Then open `http://localhost:8080` (Adminer) and `http://localhost:5540` (Redis Insight). Still use DB/Redis passwords from `/apps/.env.data`.

---

## 6. Security checklist

- [ ] Adminer/Redis Insight listen on `127.0.0.1` only (default in compose templates).
- [ ] Nginx **basic auth** in front of public hostnames.
- [ ] Cloudflare **DNS only** on GUI records.
- [ ] Prefer GUI on **dev VPS** only; prod: tunnel or IP allowlist.
- [ ] Do not reuse `DB_PASSWORD` as nginx htpasswd password.
- [ ] Rotate `/apps/.env.data` passwords independently of GUI login.

---

## 7. Stop / remove

```bash
cd /apps
docker compose --env-file /apps/.env.data stop adminer redisinsight
docker rm -f adminer redisinsight 2>/dev/null || true
```

Full stack cleanup: [vps-cleanup-and-reset.md](vps-cleanup-and-reset.md) (includes `adminer` / `redisinsight` in `docker rm` examples).

---

## Revert

Remove nginx sites, disable symlinks, reload nginx, stop containers (§7). Postgres/Redis data volumes are unchanged.
