# VPS deployment manual — Dev and Prod

**Track:** [vps-started](README.md) · Step **5** of 5 (optional) · [Docs index](../README.md)

Use this runbook when deploying the Plys platform manually **from the VPS shell**. Do not use this document for GitHub Actions workflow dispatches.

For automated deploys, use self-hosted runners on each VPS instead of SSH/SCP from GitHub-hosted runners. Setup: [Self-hosted runner](02-self-hosted-runner.md).

| Method | When to use |
|--------|-------------|
| **Manual VPS deploy** (this doc) | Debugging, emergency recovery, or when CI is unavailable |
| **Self-hosted runner** | Normal deploys triggered from GitHub Actions on the target VPS |

Detailed guides:

- VPS setup (Node, Docker, nginx): [Prerequisites](01-prerequisites.md)
- Dev-only VPS: [Dev deploy](../deploy-dev/01-deploy.md)
- Prod-only VPS: [Prod deploy](../deploy-prod/01-deploy.md)
- Combined host / full bootstrap: [All-in-one deploy](../deploy-all-in-one-vps/01-deploy.md)
- Self-hosted runner setup: [Self-hosted runner](02-self-hosted-runner.md)
- Cleanup and DB reset: [Cleanup and reset](03-cleanup-and-reset.md)

---

## 1. Environments

| Environment | Git branch | VPS target | Deploy mode |
|-------------|------------|------------|-------------|
| Dev | `develop` | Dedicated dev VPS | SSH to VPS and deploy locally |
| Prod | `main` | Dedicated prod VPS | SSH to prod VPS and deploy locally after backup/approval |

Do not deploy prod from `develop`, and do not run dev commands on the production VPS.

---

## 2. Domains and ports

### Dev

| FQDN | Port | Service |
|------|------|---------|
| `dev.ployos.com` | 3001 | ployos-marketing |
| `dev.lonaos.com` | 3011 | lonaos-marketing |
| `app-dev.ployos.com` | 3021 | ployos-app |
| `app-dev.lonaos.com` | 3031 | lonaos-app |
| `dev.plyshub.space` | 3101 | internal-hub |
| `admin-dev.plyshub.space` | 3201 | internal-admin-hub |
| `review-dev.plyshub.space` | 3301 | internal-task-reviewer |
| `api-dev.plyshub.space` | 4001 | api-gateway |
| `db-dev.plyshub.space` | 8080 | Adminer (loopback; optional) |
| `redis-dev.plyshub.space` | 5540 | Redis Insight (loopback; optional) |
| `observe-dev.plyshub.space` | 5080 | OpenObserve (loopback; optional) |

### Prod

| FQDN | Port | Service |
|------|------|---------|
| `ployos.com` | 3000 | ployos-marketing |
| `lonaos.com` | 3010 | lonaos-marketing |
| `app.ployos.com` | 3020 | ployos-app |
| `app.lonaos.com` | 3030 | lonaos-app |
| `plyshub.space` | 3100 | internal-hub |
| `admin.plyshub.space` | 3200 | internal-admin-hub |
| `review.plyshub.space` | 3300 | internal-task-reviewer |
| `api.plyshub.space` | 4000 | api-gateway |
| `db.plyshub.space` | 8080 | Adminer (loopback; prefer SSH tunnel) |
| `redis.plyshub.space` | 5540 | Redis Insight (loopback; prefer SSH tunnel) |
| `observe.plyshub.space` | 5080 | OpenObserve (loopback; optional) |

Cloudflare records should be **DNS only** for app, API, admin, review, data-tool, and monitoring hosts.

---

## 3. One-time VPS preparation

Run these steps once per VPS, or after a full cleanup.

1. Install host packages and tooling — [Prerequisites](01-prerequisites.md).

2. Create app directories — [Prerequisites §4](01-prerequisites.md#4-create-apps-layout) (manual) or §3.5.4 if a runner already owns `/apps`. Verify:

```bash
# Dev example — adjust prod/combined paths per host
ls -la /apps/plys-webapps/dev/current /apps/internal-hub-fe/dev/current /apps/internal-hub-be/dev/current
```

If missing, run the matching mkdir block from Prerequisites §4 for your VPS type.

3. Configure Postgres and Redis.

- Dev: use [Dev deploy](../deploy-dev/01-deploy.md) Section 2.
- Prod: use [Prod deploy](../deploy-prod/01-deploy.md) Section 2.

Keep the generated database and Redis passwords. They must be written into the local environment files used by the app deploy bundles.

4. Configure nginx and TLS.

- Dev hostnames: [Dev deploy](../deploy-dev/01-deploy.md) Section 4.
- Prod hostnames: [Prod deploy](../deploy-prod/01-deploy.md) Section 4.

Verify before requesting certificates:

```bash
sudo nginx -t
sudo systemctl reload nginx
```

5. Clone or update source repositories on the VPS.

```bash
cd /apps/source

# Replace the URLs if your remotes use a different GitHub org or SSH alias.
git clone git@github.com:plys-network/plys-internal-hub-serivce-api.git 2>/dev/null || true
git clone git@github.com:plys-network/plys-internal-hub.git 2>/dev/null || true
git clone git@github.com:plys-network/plys-monorepo-webapps.git 2>/dev/null || true
git clone git@github.com:plys-network/plys-dev-ops.git 2>/dev/null || true
```

---

## 4. Local environment checklist

Manual deployment reads secrets from files on the VPS. Keep them outside git and restrict permissions to the deploy user.

| File | Purpose |
|------|---------|
| `/apps/.env.data` | Postgres and Redis passwords for Docker data services |
| `/apps/internal-hub-be/dev/current/.env.dev` | Dev backend runtime config |
| `/apps/internal-hub-be/prod/current/.env.prod` | Prod backend runtime config |
| `/apps/internal-hub-fe/dev/current/.env.dev` | Dev internal hub frontend config |
| `/apps/internal-hub-fe/prod/current/.env.prod` | Prod internal hub frontend config |
| `/apps/plys-webapps/dev/current/.env.dev` | Dev webapps config |
| `/apps/plys-webapps/prod/current/.env.prod` | Prod webapps config |

At minimum, make sure app env files contain the same data-layer passwords:

| App env variable | Dev value | Prod value |
|------------------|-----------|------------|
| `DB_PASSWORD` | `POSTGRES_DEV_PASSWORD` from `/apps/.env.data` | `POSTGRES_PROD_PASSWORD` from `/apps/.env.data` |
| `REDIS_PASSWORD` | `REDIS_DEV_PASSWORD` from `/apps/.env.data` | `REDIS_PROD_PASSWORD` from `/apps/.env.data` |

Protect all local env files:

```bash
find /apps -name ".env*" -type f -exec chmod 600 {} \;
```

---

## 5. Manual deployment order

Deploy backend first, then frontend hubs, then public webapps. This keeps API health checks and migrations ahead of browser traffic.

Use the same flow for each repository:

1. Update the source checkout to the correct branch.
2. Build or package the app on the VPS.
3. Copy the generated deploy files into the matching `/apps/.../{dev,prod}/current` directory.
4. Start or reload the app from that `current` directory.
5. Verify health before continuing to the next repository.

### 5.1 Update source checkout

Dev:

```bash
export DEPLOY_ENV=dev
export GIT_BRANCH=develop
```

Prod:

```bash
export DEPLOY_ENV=prod
export GIT_BRANCH=main
```

Run for each app repo:

```bash
for repo in \
  plys-internal-hub-serivce-api \
  plys-internal-hub \
  plys-monorepo-webapps; do
  cd "/apps/source/$repo"
  git fetch --all --prune
  git checkout "$GIT_BRANCH"
  git pull --ff-only origin "$GIT_BRANCH"
done
```

### 5.2 Deploy backend manually

Deploy directory:

| Env | Deploy directory | Health port |
|-----|------------------|-------------|
| Dev | `/apps/internal-hub-be/dev/current` | 4001 |
| Prod | `/apps/internal-hub-be/prod/current` | 4000 |

On VPS:

```bash
cd /apps/source/plys-internal-hub-serivce-api
pnpm install --frozen-lockfile
pnpm build

export APP_DIR="/apps/internal-hub-be/${DEPLOY_ENV}/current"
mkdir -p "$APP_DIR"

# Copy the backend deploy bundle produced by the app repo.
# If the repo has a dedicated deploy-package script, run it first and copy that output.
rsync -a --delete \
  --exclude node_modules \
  --exclude .git \
  ./ "$APP_DIR/"

cd "$APP_DIR"
chmod 600 ".env.${DEPLOY_ENV}" 2>/dev/null || true

# Use the backend repo's compose file when present; otherwise use its documented PM2 start command.
if [ -f docker-compose.yml ]; then
  docker compose --env-file ".env.${DEPLOY_ENV}" pull || true
  docker compose --env-file ".env.${DEPLOY_ENV}" up -d
else
  pm2 start ecosystem.config.js --env "$DEPLOY_ENV" || pm2 reload ecosystem.config.js --env "$DEPLOY_ENV"
  pm2 save
fi
```

Verify backend before deploying frontends:

Dev:

```bash
curl -sf http://127.0.0.1:4001/api/v1/gateway/health
curl -sf https://api-dev.plyshub.space/v1/gateway/health
curl -sI "https://api-dev.plyshub.space/socket.io/?EIO=4&transport=polling" | head -3
```

Prod:

```bash
curl -sf http://127.0.0.1:4000/api/v1/gateway/health
curl -sf https://api.plyshub.space/v1/gateway/health
curl -sI "https://api.plyshub.space/socket.io/?EIO=4&transport=polling" | head -3
```

### 5.3 Deploy internal hub frontend manually

Deploy directory:

| Env | Deploy directory |
|-----|------------------|
| Dev | `/apps/internal-hub-fe/dev/current` |
| Prod | `/apps/internal-hub-fe/prod/current` |

On VPS:

```bash
cd /apps/source/plys-internal-hub
pnpm install --frozen-lockfile
pnpm build

export APP_DIR="/apps/internal-hub-fe/${DEPLOY_ENV}/current"
mkdir -p "$APP_DIR"
rsync -a --delete \
  --exclude node_modules \
  --exclude .git \
  ./ "$APP_DIR/"

cd "$APP_DIR"
chmod 600 ".env.${DEPLOY_ENV}" 2>/dev/null || true

if [ -f docker-compose.yml ]; then
  docker compose --env-file ".env.${DEPLOY_ENV}" pull || true
  docker compose --env-file ".env.${DEPLOY_ENV}" up -d
else
  pm2 start ecosystem.config.js --env "$DEPLOY_ENV" || pm2 reload ecosystem.config.js --env "$DEPLOY_ENV"
  pm2 save
fi
```

Verify the matching hosts:

```bash
# Dev
curl -sf https://dev.plyshub.space/api/health || curl -sI https://dev.plyshub.space | head -1
curl -sI https://admin-dev.plyshub.space | head -1
curl -sI https://review-dev.plyshub.space | head -1

# Prod
curl -sI https://plyshub.space | head -1
curl -sI https://admin.plyshub.space | head -1
curl -sI https://review.plyshub.space | head -1
```

### 5.4 Deploy public webapps manually

Deploy directory:

| Env | Deploy directory |
|-----|------------------|
| Dev | `/apps/plys-webapps/dev/current` |
| Prod | `/apps/plys-webapps/prod/current` |

On VPS:

```bash
cd /apps/source/plys-monorepo-webapps
pnpm install --frozen-lockfile
pnpm build

export APP_DIR="/apps/plys-webapps/${DEPLOY_ENV}/current"
mkdir -p "$APP_DIR"
rsync -a --delete \
  --exclude node_modules \
  --exclude .git \
  ./ "$APP_DIR/"

cd "$APP_DIR"
chmod 600 ".env.${DEPLOY_ENV}" 2>/dev/null || true

if [ -f docker-compose.yml ]; then
  docker compose --env-file ".env.${DEPLOY_ENV}" pull || true
  docker compose --env-file ".env.${DEPLOY_ENV}" up -d
else
  pm2 start ecosystem.config.js --env "$DEPLOY_ENV" || pm2 reload ecosystem.config.js --env "$DEPLOY_ENV"
  pm2 save
fi
```

Verify the matching hosts:

```bash
# Dev
curl -sI https://dev.ployos.com | head -1
curl -sI https://dev.lonaos.com | head -1
curl -sI https://app-dev.ployos.com | head -1
curl -sI https://app-dev.lonaos.com | head -1

# Prod
curl -sI https://ployos.com | head -1
curl -sI https://lonaos.com | head -1
curl -sI https://app.ployos.com | head -1
curl -sI https://app.lonaos.com | head -1
```

### 5.5 Deploy OpenObserve monitoring (optional)

After app deploys create PM2 log directories:

**On VPS** (from a checkout of `plys-dev-ops` or after copying `monitoring/` files):

```bash
export OPENOBSERVE_ROOT_PASSWORD='your-password'
export DEPLOY_ENV_LABEL=dev   # use prod on prod VPS; combined on all-in-one host

node /path/to/plys-dev-ops/scripts/render-monitoring-env.mjs \
  --deploy-env "$DEPLOY_ENV_LABEL" \
  --output /apps/monitoring/current/.env

cp /path/to/plys-dev-ops/monitoring/docker-compose.yml /apps/monitoring/current/
cp /path/to/plys-dev-ops/monitoring/otel-collector-config.yaml /apps/monitoring/current/
chmod 600 /apps/monitoring/current/.env

cd /apps/monitoring/current
docker compose -p plys-monitoring --env-file .env pull
docker compose -p plys-monitoring --env-file .env up -d
curl -sf http://127.0.0.1:5080/health && echo " openobserve OK"
```

Full guide: [OpenObserve monitoring](06-monitoring-openobserve.md).

---

## 6. Final verification

### Dev

```bash
set -a && source /apps/.env.data && set +a
docker exec postgres-dev psql -U plys_dev -d plys-db-dev -c "SELECT current_user, current_database();"
redis-cli -p 6380 -a "$REDIS_DEV_PASSWORD" --no-auth-warning PING
curl -sf http://127.0.0.1:4001/api/v1/gateway/health
curl -sf https://api-dev.plyshub.space/v1/gateway/health
curl -sI "https://api-dev.plyshub.space/socket.io/?EIO=4&transport=polling" | head -3
curl -sf https://dev.plyshub.space/api/health
pm2 list
```

### Prod

```bash
set -a && source /apps/.env.data && set +a
docker exec postgres-prod psql -U plys_prod -d plys-db -c "SELECT current_user, current_database();"
redis-cli -p 6379 -a "$REDIS_PROD_PASSWORD" --no-auth-warning PING
curl -sf http://127.0.0.1:4000/api/v1/gateway/health
curl -sf https://api.plyshub.space/v1/gateway/health
curl -sI "https://api.plyshub.space/socket.io/?EIO=4&transport=polling" | head -3
curl -sf https://ployos.com/api/health || curl -sI https://ployos.com | head -1
pm2 list
```

Confirm there is no legacy environment directory:

```bash
test ! -e /apps/environments && echo "OK"
```

---

## 7. Rollback and recovery

For rollback, check out the last known good commit on the VPS and repeat Section 5 for the affected repository.

```bash
cd /apps/source/<repo>
git checkout <known-good-commit>
# Repeat the matching manual deploy section.
```

If the VPS state is corrupted:

- Dev full reset: [Cleanup and reset](03-cleanup-and-reset.md) Section 4.
- Dev DB-only reset: [Cleanup and reset](03-cleanup-and-reset.md) Section 6.1.
- Prod full reset: [Cleanup and reset](03-cleanup-and-reset.md) Section 5. Back up first.
- Prod DB-only reset: [Cleanup and reset](03-cleanup-and-reset.md) Section 6.2. Back up first.

After cleanup, repeat this manual from Section 3.

---

## 8. Notes

- API public base URLs do not include `/api`: use `https://api-dev.plyshub.space` and `https://api.plyshub.space`.
- REST traffic is rewritten by nginx to `/api/*`; Socket.IO stays at `/socket.io/` and namespace `/ws/notifications`.
- Prefer SSH tunnels or IP allowlists for prod Adminer and Redis Insight.
