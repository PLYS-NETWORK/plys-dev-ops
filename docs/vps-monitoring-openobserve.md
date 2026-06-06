# OpenObserve monitoring (VPS)

Central observability for Plys VPS deployments: **logs**, **traces**, and **metrics** via [OpenObserve](https://openobserve.ai/) + **OTEL Collector**.

Each environment runs on its **own VPS** with a dedicated OpenObserve instance. Dev and prod are never mixed on one host.

| | **Dev VPS** | **Prod VPS** |
|---|-------------|--------------|
| GitHub Environment | `dev` | `production` |
| UI hostname | `observe-dev.lona.my` | `observe.lona.my` |
| Loopback port | `127.0.0.1:5080` | `127.0.0.1:5080` |
| Deploy workflow | **Deploy monitoring — Dev** | **Deploy monitoring — Prod** (type `deploy`) |
| `DEPLOY_ENV` in bundle | `dev` | `prod` |
| App log paths | `/apps/*/{bundle}/dev/logs/` | `/apps/*/{bundle}/prod/logs/` |
| OpenObserve org | `plys` | `plys` |
| Password secret | `OPENOBSERVE_ROOT_PASSWORD` in `dev` env | `OPENOBSERVE_ROOT_PASSWORD` in `production` env (different value) |

Deploy bundle: [`monitoring/`](../monitoring/) in `plys-dev-ops`. CI uploads to `/apps/monitoring/current` on the target VPS.

**Root email (both environments):** `huuphuc9410@gmail.com`

**KPI dashboards:** After the backend ships structured audit logs, import the SQL dashboards from [`openobserve-kpi-dashboards.md`](openobserve-kpi-dashboards.md) into org `plys` on **both** dev and prod.

---

## Architecture

```
PM2 log files (/apps/*/logs) ──► OTEL Collector (filelog)
NestJS OTLP (Phase 2)          ──► OTEL Collector (:4318 loopback)
                                        │
                                        ▼ Basic Auth
                                   OpenObserve (:5080 loopback)
                                        │
                                   nginx TLS ──► observe-dev.lona.my  (dev)
                                              └─► observe.lona.my      (prod)
```

- **Org:** `plys` on each VPS (instances are physically isolated).
- **Per-service streams:** `service.name` from log filename or OTEL resource attributes.
- **`deployment.environment`:** `dev` or `prod` (set by OTEL collector resource processor).

---

## Shared prerequisites

### GitHub repository secrets

Configure **separately** under GitHub → Settings → Environments:

| Secret | `dev` environment | `production` environment |
|--------|-------------------|--------------------------|
| `VPS_HOST` | Dev VPS IP | Prod VPS IP |
| `VPS_USER` | SSH deploy user | SSH deploy user |
| `VPS_SSH_KEY` | SSH private key | SSH private key |
| `VPS_SSH_PORT` | SSH port (usually `22`) | SSH port |
| `OPENOBSERVE_ROOT_PASSWORD` | Dev password (unique) | Prod password (unique) |

Generate a safe password (run once per environment):

```bash
openssl rand -base64 24 | tr -d '/+=$#' | head -c 32
```

Use **different** passwords for dev and prod. The same email (`huuphuc9410@gmail.com`) is used on both.

### Authentication model

| Surface | Credentials |
|---------|-------------|
| Web UI | `huuphuc9410@gmail.com` + environment's `OPENOBSERVE_ROOT_PASSWORD` |
| OTLP ingest | Same pair as HTTP Basic Auth (OTEL collector → OpenObserve) |

nginx does **not** use `auth_basic` — OpenObserve handles login.

Password rotation requires clearing `/apps/monitoring/data` — see [monitoring/README.md](../monitoring/README.md).

---

## Dev VPS setup

Complete these steps on the **dev VPS** before or after app deploys.

### Dev — 1. Directory prep

**On dev VPS:**

```bash
sudo mkdir -p /apps/monitoring/{current,data}
sudo chown -R "$USER:$USER" /apps/monitoring
chmod 700 /apps/monitoring/data
```

Confirm app log dirs exist (populated after app CI deploys):

```bash
ls /apps/internal-hub-be/dev/logs
ls /apps/internal-hub-fe/dev/logs
ls /apps/plys-webapps/dev/logs
```

### Dev — 2. DNS (Cloudflare, grey cloud)

| Record | Type | Target |
|--------|------|--------|
| `observe-dev.lona.my` | A | Dev VPS public IP |

Use **DNS only** (not proxied) for Certbot HTTP-01.

Verify:

```bash
dig +short observe-dev.lona.my
```

### Dev — 3. nginx vhost

**On dev VPS:**

```bash
sudo tee /etc/nginx/sites-available/observe-dev.lona.my > /dev/null <<'NGINX'
server {
    listen 80;
    server_name observe-dev.lona.my;
    location / {
        proxy_pass http://127.0.0.1:5080;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}
NGINX
sudo ln -sf /etc/nginx/sites-available/observe-dev.lona.my /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
```

### Dev — 4. TLS (Certbot)

**On dev VPS:**

```bash
sudo certbot --nginx -d observe-dev.lona.my
sudo certbot renew --dry-run
```

### Dev — 5. Deploy (GitHub Actions)

1. Ensure GitHub **Environment `dev`** has all secrets (see [Shared prerequisites](#shared-prerequisites)).
2. In `plys-dev-ops`: **Actions → Deploy monitoring — Dev → Run workflow**.
3. Workflow renders `.env`, SCPs to `/apps/monitoring/current`, runs `docker compose up -d`.

Recommended deploy order on dev VPS:

1. Postgres/Redis ([infra/README.md](infra/README.md))
2. `plys-internal-hub-serivce-api` — Deploy Dev
3. `plys-internal-hub` — Deploy Dev (×3 apps)
4. `plys-monorepo-webapps` — Deploy Dev (×4 apps)
5. **`plys-dev-ops` — Deploy monitoring — Dev** ← this guide

### Dev — 6. Verify

**On dev VPS:**

```bash
# Health (no auth)
curl -sf http://127.0.0.1:5080/health && echo " openobserve OK"

# Containers
cd /apps/monitoring/current
docker compose --env-file .env ps

# Basic Auth ingest (uses password from rendered .env)
set -a && source /apps/monitoring/current/.env && set +a
curl -sf -u "huuphuc9410@gmail.com:${ZO_ROOT_USER_PASSWORD}" \
  -H "Content-Type: application/json" \
  -d '{"level":"info","message":"dev auth smoke test"}' \
  "http://127.0.0.1:5080/api/plys/default/_json" && echo " ingest OK"

# Filelog sources (after app deploys)
ls /apps/internal-hub-be/dev/logs/api-gateway-out.log 2>/dev/null && echo " backend logs present"
```

**In browser:** `https://observe-dev.lona.my` — login with `huuphuc9410@gmail.com` + dev `OPENOBSERVE_ROOT_PASSWORD`.

**Dev checklist**

- [ ] `dig observe-dev.lona.my` → dev VPS IP
- [ ] `curl -sf http://127.0.0.1:5080/health`
- [ ] HTTPS UI login works
- [ ] Logs visible for at least `api-gateway` (org `plys`, filter by `service_name`)
- [ ] `.env` on VPS is mode `600`: `ls -la /apps/monitoring/current/.env`

---

## Prod VPS setup

Complete these steps on the **prod VPS**. Prod deploy is manual and requires confirmation.

### Prod — 1. Directory prep

**On prod VPS:**

```bash
sudo mkdir -p /apps/monitoring/{current,data}
sudo chown -R "$USER:$USER" /apps/monitoring
chmod 700 /apps/monitoring/data
```

Confirm app log dirs exist (populated after prod app deploys):

```bash
ls /apps/internal-hub-be/prod/logs
ls /apps/internal-hub-fe/prod/logs
ls /apps/plys-webapps/prod/logs
```

### Prod — 2. DNS (Cloudflare, grey cloud)

| Record | Type | Target |
|--------|------|--------|
| `observe.lona.my` | A | Prod VPS public IP |

Use **DNS only** (not proxied).

Verify:

```bash
dig +short observe.lona.my
```

### Prod — 3. nginx vhost

**On prod VPS:**

```bash
sudo tee /etc/nginx/sites-available/observe.lona.my > /dev/null <<'NGINX'
server {
    listen 80;
    server_name observe.lona.my;
    location / {
        proxy_pass http://127.0.0.1:5080;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}
NGINX
sudo ln -sf /etc/nginx/sites-available/observe.lona.my /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
```

### Prod — 4. TLS (Certbot)

**On prod VPS:**

```bash
sudo certbot --nginx -d observe.lona.my
sudo certbot renew --dry-run
```

### Prod — 5. Deploy (GitHub Actions)

1. Ensure GitHub **Environment `production`** has all secrets (separate prod VPS host + **different** password).
2. In `plys-dev-ops`: **Actions → Deploy monitoring — Prod → Run workflow**.
3. In the **confirm** field, type exactly: `deploy`
4. Workflow deploys to prod VPS `/apps/monitoring/current`.

Recommended deploy order on prod VPS:

1. Postgres/Redis
2. Backend / FE / webapps — **Deploy Prod** workflows (manual, type `deploy` on each)
3. **`plys-dev-ops` — Deploy monitoring — Prod** (manual, type `deploy`)

### Prod — 6. Verify

**On prod VPS:**

```bash
curl -sf http://127.0.0.1:5080/health && echo " openobserve OK"

cd /apps/monitoring/current
docker compose --env-file .env ps

set -a && source /apps/monitoring/current/.env && set +a
curl -sf -u "huuphuc9410@gmail.com:${ZO_ROOT_USER_PASSWORD}" \
  -H "Content-Type: application/json" \
  -d '{"level":"info","message":"prod auth smoke test"}' \
  "http://127.0.0.1:5080/api/plys/default/_json" && echo " ingest OK"

ls /apps/internal-hub-be/prod/logs/api-gateway-out.log 2>/dev/null && echo " backend logs present"
```

**In browser:** `https://observe.lona.my` — login with `huuphuc9410@gmail.com` + prod `OPENOBSERVE_ROOT_PASSWORD`.

**Prod checklist**

- [ ] `dig observe.lona.my` → prod VPS IP
- [ ] `curl -sf http://127.0.0.1:5080/health`
- [ ] HTTPS UI login works
- [ ] Logs visible for prod services (org `plys`)
- [ ] Prod password differs from dev (separate GitHub secret)

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

In OpenObserve UI (org `plys` on the VPS you are viewing):

| Goal | Filter / field |
|------|----------------|
| One service | `service_name = 'api-gateway'` |
| One bundle | `service_namespace = 'internal-hub-be'` |
| Environment label | `deployment_environment = 'dev'` or `'prod'` |

On dev VPS you only see dev traffic; on prod VPS only prod traffic.

---

## Instrument backend services (Phase 2)

Scope: `plys-internal-hub-serivce-api` only. Frontend OTEL is deferred.

| Variable | Dev (`.env.dev`) | Prod (`.env.prod`) |
|----------|------------------|---------------------|
| `OTEL_EXPORTER_OTLP_ENDPOINT` | `http://172.17.0.1:4318` | `http://172.17.0.1:4318` |
| `OTEL_EXPORTER_OTLP_PROTOCOL` | `http/protobuf` | `http/protobuf` |
| `OTEL_RESOURCE_ATTRIBUTES` | `service.namespace=internal-hub-be,deployment.environment=dev` | `service.namespace=internal-hub-be,deployment.environment=prod` |
| `OTEL_SERVICE_NAME` | Per container in `docker-compose.apps.yml` | Same |

Pino + `@opentelemetry/instrumentation-pino` adds `trace_id` / `span_id` to structured logs.

Verify Docker host gateway on each VPS: `ip route | grep default` (often `172.17.0.1`).

---

## Troubleshooting

| Symptom | Dev check | Prod check |
|---------|-----------|------------|
| UI login fails | First boot only — clear `/apps/monitoring/data`, redeploy dev workflow | Same on prod VPS (separate data dir) |
| Empty log streams | `ls /apps/internal-hub-be/dev/logs/` | `ls /apps/internal-hub-be/prod/logs/` |
| Collector 401 | `docker compose logs otel-collector` on dev VPS | Same on prod VPS |
| Wrong environment data | You are on dev VPS? Use `observe-dev.lona.my` | Use `observe.lona.my` on prod VPS only |
| Port conflict | `ss -tlnp \| grep 5080` — not `:3100`/`:3200` (internal-hub FE) | Same |

**Reset monitoring only:** [vps-cleanup-and-reset.md](vps-cleanup-and-reset.md) §8

**Manual restart (either VPS):**

```bash
cd /apps/monitoring/current
docker compose --env-file .env pull
docker compose --env-file .env up -d
docker compose --env-file .env logs -f --tail 50
```

**Re-deploy from CI:** run the matching workflow (**Dev** or **Prod**) in `plys-dev-ops`.
