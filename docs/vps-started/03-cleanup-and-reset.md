# VPS cleanup and database reset

**Track:** [vps-started](README.md) · Maintenance · [Docs index](../README.md)

Destructive operations on the **VPS only**. Use before a greenfield deploy or when you need a fresh Postgres/Redis without reinstalling the OS.

Related deploy guides:

- [Infra templates](infra/README.md) — compose + `.env.data` templates to restore after reset
- [Adminer + Redis Insight](04-data-tools-adminer-redis.md) — Adminer + Redis Insight (recreated from compose templates)
- [OpenObserve monitoring](06-monitoring-openobserve.md) — monitoring stack teardown and redeploy
- [Dev deploy](../deploy-dev/01-deploy.md) — after dev reset, redo from Section 2
- [Prod deploy](../deploy-prod/01-deploy.md) — after prod reset, redo from Section 2
- [All-in-one deploy](../deploy-all-in-one-vps/01-deploy.md) — combined VPS, redo from Section 1.5

---

## Before you start

| Action | Risk |
|--------|------|
| Remove Docker volumes | **All DB data lost** for that environment |
| `pm2 kill` | Stops all app processes |
| `rm -rf /apps/plys-webapps` | Removes deploy bundles; rerun the matching self-hosted runner deploy |
| Delete `/apps/.env.data` | You must regenerate passwords and update GitHub secrets |

---

## 1. Backup (optional)

**On VPS** — run only if you need to keep data:

```bash
BACKUP_DIR=~/backups/$(date +%Y%m%d-%H%M)
mkdir -p "$BACKUP_DIR"
cd "$BACKUP_DIR"

# Postgres (adjust container names if missing)
docker exec postgres-prod pg_dump -U plys_prod plys-db -Fc -f plys-db-prod.dump 2>/dev/null || true
docker exec postgres-dev  pg_dump -U plys_dev  plys-db-dev -Fc -f plys-db-dev.dump 2>/dev/null || true

# Redis — no standard dump here; rely on Postgres for app state
sudo tar czf apps-logs-backup.tgz /apps/*/logs 2>/dev/null || true

ls -la "$BACKUP_DIR"
```

---

## 2. Stop all runtime

**On VPS:**

```bash
pm2 list
pm2 kill
pm2 unstartup systemd 2>/dev/null || true

docker ps
docker stop $(docker ps -q) 2>/dev/null || true
docker ps
```

---

## 3. Full VPS cleanup (apps + data layer)

Use on a **combined** host (dev + prod) or when you want everything under `/apps` removed.

**On VPS:**

```bash
cd /apps
docker compose --env-file /apps/.env.data down 2>/dev/null || docker compose down 2>/dev/null || true

docker compose -p plys-monitoring down 2>/dev/null || true
docker rm -f postgres-dev postgres-prod redis-dev redis-prod adminer redisinsight openobserve otel-collector 2>/dev/null || true
docker volume ls | grep -E 'postgres|redis|redisinsight'

docker volume rm apps_postgres-dev-data apps_postgres-prod-data apps_redis-dev-data apps_redis-prod-data apps_redisinsight-data 2>/dev/null || true

sudo rm -rf \
  /apps/marketing-ployos /apps/ployos /apps/lonaos \
  /apps/ployos-app /apps/lonaos-app \
  /apps/plys-webapps /apps/internal-hub-fe /apps/internal-hub-be \
  /apps/environments /apps/monitoring

sudo rm -f /apps/docker-compose.yml /apps/.env.data

ls -la /apps
```

**Do not** delete `/etc/nginx` or `/etc/letsencrypt` unless you intend to reissue TLS certs.

**Next:** recreate dirs and data layer — [All-in-one deploy](../deploy-all-in-one-vps/01-deploy.md) Section 1.5–1.6, or dev/prod guides Section 2–3.

---

## 4. Dev-only VPS cleanup

**On VPS:**

```bash
pm2 kill 2>/dev/null || true
docker stop $(docker ps -q) 2>/dev/null || true

cd /apps
docker compose --env-file /apps/.env.data down 2>/dev/null || true
docker compose -p plys-monitoring down 2>/dev/null || true
docker rm -f postgres-dev redis-dev adminer redisinsight openobserve otel-collector 2>/dev/null || true
docker volume rm apps_postgres-dev-data apps_redis-dev-data apps_redisinsight-data 2>/dev/null || true

sudo rm -rf /apps/plys-webapps /apps/internal-hub-fe /apps/internal-hub-be /apps/environments /apps/monitoring
sudo rm -f /apps/docker-compose.yml /apps/.env.data

ls -la /apps
```

**Next:** [Dev deploy](../deploy-dev/01-deploy.md) from Section 2.

---

## 5. Prod-only VPS cleanup

**On VPS** — backup prod DB first (Section 1).

```bash
pm2 kill 2>/dev/null || true
docker stop $(docker ps -q) 2>/dev/null || true

cd /apps
docker compose --env-file /apps/.env.data down 2>/dev/null || true
docker compose -p plys-monitoring down 2>/dev/null || true
docker rm -f postgres-prod redis-prod adminer redisinsight openobserve otel-collector 2>/dev/null || true
docker volume rm apps_postgres-prod-data apps_redis-prod-data apps_redisinsight-data 2>/dev/null || true

sudo rm -rf /apps/plys-webapps /apps/internal-hub-fe /apps/internal-hub-be /apps/environments /apps/monitoring
sudo rm -f /apps/docker-compose.yml /apps/.env.data

ls -la /apps
```

**Next:** [Prod deploy](../deploy-prod/01-deploy.md) from Section 2.

---

## 6. Reset Docker database only (remove volume + recreate)

Use when apps/nginx can stay, but you want an **empty** Postgres (and optionally Redis) with the **same** database name and ports.

### 6.1 Dev database (`plys-db-dev`)

**On VPS:**

```bash
cd /apps

# Stop apps using the DB first (recommended)
pm2 kill 2>/dev/null || true

docker compose --env-file /apps/.env.data stop postgres-dev 2>/dev/null || true
docker rm -f postgres-dev 2>/dev/null || true

docker volume ls | grep postgres-dev
docker volume rm apps_postgres-dev-data 2>/dev/null || true
# If name differs, use the name from `docker volume ls`

# Recreate (requires /apps/docker-compose.yml + /apps/.env.data from dev template)
docker compose --env-file /apps/.env.data up -d postgres-dev
sleep 5

docker exec postgres-dev psql -U plys_dev -d plys-db-dev -c "SELECT current_user, current_database();"
```

**After empty DB:** rerun backend deploy with migrations — GitHub **Deploy Dev** on `plys-internal-hub-serivce-api` using the `plys-dev-vps` runner (`run-migrations: true`).

### 6.2 Prod database (`plys-db`)

**On VPS** — backup Section 1 first.

```bash
cd /apps
pm2 kill 2>/dev/null || true

docker compose --env-file /apps/.env.data stop postgres-prod 2>/dev/null || true
docker rm -f postgres-prod 2>/dev/null || true

docker volume rm apps_postgres-prod-data 2>/dev/null || true

docker compose --env-file /apps/.env.data up -d postgres-prod
sleep 5

docker exec postgres-prod psql -U plys_prod -d plys-db -c "SELECT current_user, current_database();"
```

**After empty DB:** GitHub **Deploy Prod** on backend with migrations using the `plys-prod-vps` runner.

### 6.3 Both databases (combined VPS)

**On VPS:**

```bash
cd /apps
pm2 kill 2>/dev/null || true
docker compose --env-file /apps/.env.data down 2>/dev/null || true
docker rm -f postgres-dev postgres-prod 2>/dev/null || true
docker volume rm apps_postgres-dev-data apps_postgres-prod-data 2>/dev/null || true

docker compose --env-file /apps/.env.data up -d postgres-dev postgres-prod
sleep 5

docker exec postgres-dev  psql -U plys_dev  -d plys-db-dev -c "SELECT current_database();"
docker exec postgres-prod psql -U plys_prod -d plys-db     -c "SELECT current_database();"
```

---

## 7. Reset Redis only (remove volume + recreate)

Passwords stay in `/apps/.env.data` if you keep that file.

### 7.1 Dev Redis

**On VPS:**

```bash
cd /apps
docker compose --env-file /apps/.env.data stop redis-dev 2>/dev/null || true
docker rm -f redis-dev 2>/dev/null || true
docker volume rm apps_redis-dev-data 2>/dev/null || true
docker compose --env-file /apps/.env.data up -d redis-dev

set -a && source /apps/.env.data && set +a
redis-cli -p 6380 -a "$REDIS_DEV_PASSWORD" --no-auth-warning PING
```

### 7.2 Prod Redis

**On VPS:**

```bash
cd /apps
docker compose --env-file /apps/.env.data stop redis-prod 2>/dev/null || true
docker rm -f redis-prod 2>/dev/null || true
docker volume rm apps_redis-prod-data 2>/dev/null || true
docker compose --env-file /apps/.env.data up -d redis-prod

set -a && source /apps/.env.data && set +a
redis-cli -p 6379 -a "$REDIS_PROD_PASSWORD" --no-auth-warning PING
```

---

## 8. Inspect Docker state (troubleshooting)

**On VPS:**

```bash
docker ps -a
docker volume ls
docker compose -f /apps/docker-compose.yml --env-file /apps/.env.data ps 2>/dev/null || true
ss -tlnp | grep -E '5432|5433|6379|6380'
pm2 list
```

---

## 9. Recreate empty app directories (after full cleanup)

Use the matching block from [Prerequisites §4](01-prerequisites.md#4-create-apps-layout) or [§3.5.4](01-prerequisites.md#354-create-deploy-directories-and-grant-runner-access) (mkdir first, then `chown`).

**On VPS** — combined VPS example:

```bash
sudo mkdir -p /apps/source
sudo mkdir -p /apps/plys-webapps/{dev,prod}/{current,logs}
sudo mkdir -p /apps/internal-hub-fe/{dev,prod}/{current,logs}
sudo mkdir -p /apps/internal-hub-be/{dev,prod}/{current,logs}

# Self-hosted runner:
# sudo chown -R github-runner:github-runner /apps/source /apps/plys-webapps /apps/internal-hub-fe /apps/internal-hub-be

# Manual deploy:
sudo chown -R "$USER:$USER" /apps/source /apps/plys-webapps /apps/internal-hub-fe /apps/internal-hub-be
```

Then follow the deploy guide for your environment.
