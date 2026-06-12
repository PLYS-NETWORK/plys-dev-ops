# VPS — OpenObserve monitoring

**Track:** [vps-started](README.md) · Optional · [Docs index](../README.md)

Central observability for Plys VPS deployments: **logs**, **traces**, and **metrics** via [OpenObserve](https://openobserve.ai/) + **OTEL Collector**.

Each dedicated dev or prod VPS runs its **own** OpenObserve instance. Combined VPS runs one stack that ingests both dev and prod log paths (see [Combined VPS](#combined-vps-all-in-one)).

Deploy bundle: [`monitoring/`](../../monitoring/) in `plys-dev-ops`. CI copies to `/apps/monitoring/current` on the target VPS via organization self-hosted runner.

Related: [Dev deploy](../deploy-dev/01-deploy.md) · [Prod deploy](../deploy-prod/01-deploy.md) · [All-in-one deploy](../deploy-all-in-one-vps/01-deploy.md) · [KPI dashboards](../openobserve-kpi-dashboards.md) · [Self-hosted runner](02-self-hosted-runner.md)

---

## Overview

| | **Dev VPS** | **Prod VPS** | **Combined VPS** |
|---|-------------|--------------|------------------|
| GitHub Environment | `dev` | `production` | `dev` or `production` (pick one secret set) |
| UI hostname | `observe-dev.plyshub.space` | `observe.plyshub.space` | both optional (same loopback) |
| Loopback port | `127.0.0.1:5080` | `127.0.0.1:5080` | `127.0.0.1:5080` |
| Deploy workflow | **Deploy monitoring — Dev** | **Deploy monitoring — Prod** (type `deploy`) | Dev workflow with `--deploy-env combined` |
| Runner | `plys-dev-vps` | `plys-prod-vps` | whichever host runs the stack |
| `DEPLOY_ENV` in bundle | `dev` | `prod` | `combined` (filelog uses path segment) |
| App log paths | `/apps/*/{bundle}/dev/logs/` | `/apps/*/{bundle}/prod/logs/` | both |
| OpenObserve org | `plys` | `plys` | `plys` |
| Password secret | `OPENOBSERVE_ROOT_PASSWORD` in `dev` | `OPENOBSERVE_ROOT_PASSWORD` in `production` | same as host role |

**Root email (all environments):** `huuphuc9410@gmail.com`

**KPI dashboards:** import SQL dashboards from [openobserve-kpi-dashboards.md](../openobserve-kpi-dashboards.md) into org `plys`.

---

## Architecture

```
PM2 log files (/apps/*/logs) ──► OTEL Collector (filelog)
NestJS OTLP (Phase 2)          ──► OTEL Collector (:4318 loopback)
                                        │
                                        ▼ Basic Auth
                                   OpenObserve (:5080 loopback)
                                        │
                                   nginx TLS ──► observe-dev.plyshub.space  (dev)
                                              └─► observe.plyshub.space      (prod)
```

- **Org:** `plys` on each VPS (instances are physically isolated on dedicated hosts).
- **Per-service streams:** `service.name` from log filename or OTEL resource attributes.
- **`deployment.environment`:** `dev` or `prod` from log path on combined VPS; otherwise from `DEPLOY_ENV` env var.

---

## Shared prerequisites

### GitHub repository secrets (plys-dev-ops only)

Configure **separately** under GitHub → Settings → Environments:

| Secret | `dev` environment | `production` environment |
|--------|-------------------|--------------------------|
| `OPENOBSERVE_ROOT_PASSWORD` | Dev password (unique) | Prod password (unique) |

Do **not** use `VPS_HOST`, `VPS_USER`, `VPS_SSH_KEY`, or `VPS_SSH_PORT` — deploy jobs run on the VPS self-hosted runner. See [Self-hosted runner](02-self-hosted-runner.md).

Generate a safe password (run once per environment):

```bash
openssl rand -base64 24 | tr -d '/+=$#' | head -c 32
```

Use **different** passwords for dev and prod.

### Authentication model

| Surface | Credentials |
|---------|-------------|
| Web UI | `huuphuc9410@gmail.com` + environment's `OPENOBSERVE_ROOT_PASSWORD` |
| OTLP ingest | Same pair as HTTP Basic Auth (OTEL collector → OpenObserve) |

nginx does **not** use `auth_basic` — OpenObserve handles login.

Password rotation requires clearing `/apps/monitoring/data` — see [monitoring/README.md](../../monitoring/README.md).

---

## 1. VPS prep

**On VPS:**

```bash
sudo mkdir -p /apps/monitoring/{current,data}
sudo chown -R "$USER:$USER" /apps/monitoring
chmod 700 /apps/monitoring/data
```

Include `/apps/monitoring` in runner `chown` if using self-hosted runner — [Prerequisites §3.5.4](01-prerequisites.md#354-create-deploy-directories-and-grant-runner-access).

Confirm app log dirs exist (populated after app deploys):

```bash
# Dev-only VPS
ls /apps/internal-hub-be/dev/logs
ls /apps/internal-hub-fe/dev/logs
ls /apps/plys-webapps/dev/logs

# Prod-only VPS
ls /apps/internal-hub-be/prod/logs
ls /apps/internal-hub-fe/prod/logs
ls /apps/plys-webapps/prod/logs
```

---

## 2. DNS (Cloudflare, grey cloud)

| Host | Type | Target |
|------|------|--------|
| `observe-dev.plyshub.space` | A | Dev VPS public IP |
| `observe.plyshub.space` | A | Prod VPS public IP |

Use **DNS only** (not proxied) for Certbot HTTP-01.

```bash
dig +short observe-dev.plyshub.space
dig +short observe.plyshub.space
```

---

## 3. nginx vhost

Set hostname before applying blocks:

```bash
# Dev-only VPS
export OBSERVE_HOST="observe-dev.plyshub.space"

# Prod-only VPS
export OBSERVE_HOST="observe.plyshub.space"
```

**On VPS:**

```bash
sudo tee /etc/nginx/sites-available/${OBSERVE_HOST} > /dev/null <<NGINX
server {
    listen 80;
    server_name ${OBSERVE_HOST};
    location / {
        proxy_pass http://127.0.0.1:5080;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}
NGINX
sudo ln -sf /etc/nginx/sites-available/${OBSERVE_HOST} /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
```

**Combined VPS:** create both vhosts pointing to the same `127.0.0.1:5080`, or use `observe.plyshub.space` only.

---

## 4. TLS (Certbot)

Add observe host(s) to your deploy guide certbot command, or run standalone:

```bash
# Dev-only
sudo certbot --nginx -d observe-dev.plyshub.space

# Prod-only
sudo certbot --nginx -d observe.plyshub.space

# Combined
sudo certbot --nginx -d observe-dev.plyshub.space -d observe.plyshub.space

sudo certbot renew --dry-run
```

---

## 5. Deploy

### GitHub Actions (recommended)

1. Ensure GitHub **Environment** has `OPENOBSERVE_ROOT_PASSWORD` (see [Shared prerequisites](#shared-prerequisites)).
2. In `plys-dev-ops`:
   - **Dev:** Actions → **Deploy monitoring — Dev** → Run workflow
   - **Prod:** Actions → **Deploy monitoring — Prod** → type `deploy` to confirm
3. Workflow renders `.env`, copies bundle to `/apps/monitoring/current`, runs `docker compose up -d` on the VPS runner.

**Recommended deploy order:**

1. Postgres/Redis ([Infra templates](infra/README.md))
2. `plys-internal-hub-service-api` — Deploy Dev / Prod
3. `plys-internal-hub` — Deploy Dev / Prod (×3 apps)
4. `plys-monorepo-webapps` — Deploy Dev / Prod (×4 apps)
5. **`plys-dev-ops` — Deploy monitoring — Dev / Prod** ← this guide

### Manual deploy (VPS shell)

```bash
cd /path/to/plys-dev-ops   # or copy monitoring/ files to VPS
export OPENOBSERVE_ROOT_PASSWORD='your-password'
node scripts/render-monitoring-env.mjs \
  --deploy-env dev \
  --output /apps/monitoring/current/.env
cp monitoring/docker-compose.yml monitoring/otel-collector-config.yaml /apps/monitoring/current/
chmod 600 /apps/monitoring/current/.env
cd /apps/monitoring/current
docker compose -p plys-monitoring --env-file .env pull
docker compose -p plys-monitoring --env-file .env up -d
```

Use `--deploy-env prod` on prod VPS; `--deploy-env combined` on all-in-one host.

---

## 6. Verify

**On VPS:**

```bash
curl -sf http://127.0.0.1:5080/health && echo " openobserve OK"

cd /apps/monitoring/current
docker compose -p plys-monitoring --env-file .env ps

set -a && source /apps/monitoring/current/.env && set +a
curl -sf -u "huuphuc9410@gmail.com:${ZO_ROOT_USER_PASSWORD}" \
  -H "Content-Type: application/json" \
  -d '{"level":"info","message":"auth smoke test"}' \
  "http://127.0.0.1:5080/api/plys/default/_json" && echo " ingest OK"

ls /apps/internal-hub-be/dev/logs/api-gateway-out.log 2>/dev/null && echo " backend logs present"
```

**In browser:** `https://observe-dev.plyshub.space` or `https://observe.plyshub.space` — login with root email + environment password.

**Checklist**

- [ ] DNS resolves to correct VPS IP
- [ ] `curl -sf http://127.0.0.1:5080/health`
- [ ] HTTPS UI login works
- [ ] Logs visible for at least `api-gateway` (org `plys`)
- [ ] `.env` on VPS is mode `600`: `ls -la /apps/monitoring/current/.env`

---

## Combined VPS (all-in-one)

On a single host with dev and prod app stacks:

1. Run **one** OpenObserve stack (`DEPLOY_ENV=combined` via `--deploy-env combined`).
2. OTEL filelog parser sets `deployment.environment` from the log path segment (`dev` or `prod`) — see `monitoring/otel-collector-config.yaml`.
3. Optional DNS: both `observe-dev.plyshub.space` and `observe.plyshub.space` can proxy to the same `:5080`.
4. Filter logs in UI by `deployment_environment = 'dev'` or `'prod'`.

See also [All-in-one deploy](../deploy-all-in-one-vps/01-deploy.md).

---

## Service inventory (`service.name`)

| Bundle | Services |
|--------|----------|
| `plys-webapps` | `ployos-marketing`, `lonaos-marketing`, `ployos-app`, `lonaos-app` |
| `internal-hub-fe` | `internal-hub`, `internal-admin-hub`, `internal-task-reviewer` |
| `internal-hub-be` | `api-gateway`, `identity-service`, `business-service`, `consultant-service`, `internal-admin-service`, `internal-task-reviewer-service`, `finance-service`, `notifications-service`, `platform-service`, `ai-agents-service` |

**Phase 1 (filelog):** PM2 logs at `/apps/{bundle}/{dev|prod}/logs/{service}-{out|error}.log`.

---

## Querying logs

In OpenObserve UI (org `plys`):

| Goal | Filter / field |
|------|----------------|
| One service | `service_name = 'api-gateway'` |
| One bundle | `service_namespace = 'internal-hub-be'` |
| Environment label | `deployment_environment = 'dev'` or `'prod'` |

---

## Instrument backend services (Phase 2)

Scope: `plys-internal-hub-service-api` only. Frontend OTEL is deferred.

| Variable | Dev (`.env.dev`) | Prod (`.env.prod`) |
|----------|------------------|---------------------|
| `OTEL_EXPORTER_OTLP_ENDPOINT` | `http://172.17.0.1:4318` | `http://172.17.0.1:4318` |
| `OTEL_EXPORTER_OTLP_PROTOCOL` | `http/protobuf` | `http/protobuf` |
| `OTEL_RESOURCE_ATTRIBUTES` | `service.namespace=internal-hub-be,deployment.environment=dev` | `service.namespace=internal-hub-be,deployment.environment=prod` |
| `OTEL_SERVICE_NAME` | Per container in `docker-compose.apps.yml` | Same |

Verify Docker host gateway: `ip route | grep default` (often `172.17.0.1`).

---

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| UI login fails | First boot only — clear `/apps/monitoring/data`, redeploy workflow |
| Empty log streams | `ls /apps/internal-hub-be/dev/logs/` (or `prod/logs/`) — deploy apps first |
| Collector 401 | `docker compose -p plys-monitoring logs otel-collector` — check `OPENOBSERVE_AUTH_B64` |
| Wrong environment data | On combined VPS, filter by `deployment_environment`; on dedicated VPS use matching observe hostname |
| Port conflict | `ss -tlnp \| grep 5080` — not `:3100`/`:3200` (internal-hub FE) |
| `openobserve is unhealthy` | Official image has no in-container healthcheck — use host `curl http://127.0.0.1:5080/health` |

**Manual restart:**

```bash
cd /apps/monitoring/current
docker compose -p plys-monitoring --env-file .env pull
docker compose -p plys-monitoring --env-file .env up -d
docker compose -p plys-monitoring --env-file .env logs -f --tail 50
```

**Re-deploy from CI:** run **Deploy monitoring — Dev** or **Deploy monitoring — Prod** in `plys-dev-ops`.

**Full reset:** [Cleanup and reset](03-cleanup-and-reset.md).

---

## Security

- OpenObserve binds `127.0.0.1:5080` only — expose via nginx TLS.
- Use **unique** dev and prod `OPENOBSERVE_ROOT_PASSWORD` values.
- OTLP ports `4317`/`4318` are loopback-only.
- Do not commit rendered `.env` files.
