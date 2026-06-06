# OpenObserve monitoring stack

Docker Compose bundle for **OpenObserve** + **OTEL Collector**, deployed to each VPS at `/apps/monitoring/current` via GitHub Actions.

Full guide: [docs/vps-monitoring-openobserve.md](../docs/vps-monitoring-openobserve.md)

KPI dashboards (import JSON into org `plys`): [docs/openobserve-kpi-dashboards.md](../docs/openobserve-kpi-dashboards.md)

## Files

| File | Purpose |
|------|---------|
| [docker-compose.yml](docker-compose.yml) | OpenObserve UI `:5080`, OTEL Collector `:4317`/`:4318` (loopback) |
| [otel-collector-config.yaml](otel-collector-config.yaml) | OTLP + PM2 filelog → OpenObserve org `plys` |
| [env.example](env.example) | Non-secret template; password filled by CI |
| [dashboards/](dashboards/) | Importable OpenObserve KPI dashboard JSON (`platform-kpis`, `security-audit-kpis`, `business-kpis`) |

## First-time VPS prep (once per VPS)

**On VPS:**

```bash
sudo mkdir -p /apps/monitoring/{current,data}
sudo chown -R "$USER:$USER" /apps/monitoring
chmod 700 /apps/monitoring/data
```

Then configure DNS + nginx per [vps-monitoring-openobserve.md](../docs/vps-monitoring-openobserve.md).

## GitHub secrets (per environment)

Add in **GitHub → Settings → Environments → `dev` / `production`**:

| Secret | Description |
|--------|-------------|
| `VPS_HOST` | VPS IP or hostname |
| `VPS_USER` | SSH deploy user |
| `VPS_SSH_KEY` | SSH private key (full PEM) |
| `VPS_SSH_PORT` | SSH port (usually `22`) |
| `OPENOBSERVE_ROOT_PASSWORD` | Basic Auth password for UI login **and** OTLP ingest (unique per environment) |

Generate a safe password:

```bash
openssl rand -base64 24 | tr -d '/+=$#' | head -c 32
```

Root email is fixed: `huuphuc9410@gmail.com` (not a secret).

## Deploy (GitHub Actions)

1. **Dev:** Actions → **Deploy monitoring — Dev** → Run workflow
2. **Prod:** Actions → **Deploy monitoring — Prod** → type `deploy` to confirm

Workflow renders `.env` from secrets, SCPs bundle to `/apps/monitoring/current`, runs `docker compose up -d`.

## Manual debug on VPS

```bash
cd /apps/monitoring/current
docker compose --env-file .env ps
docker compose --env-file .env logs -f otel-collector
curl -sf http://127.0.0.1:5080/health
```

## Local smoke test (optional)

```bash
cd monitoring
cp env.example .env
# Edit .env: set ZO_ROOT_USER_PASSWORD and OPENOBSERVE_AUTH_B64 (base64 of email:password)
export OPENOBSERVE_DATA_DIR=./data
mkdir -p ./data
docker compose --env-file .env up -d
curl -sf http://127.0.0.1:5080/health
```

## Password rotation

`ZO_ROOT_USER_PASSWORD` only applies on **first boot** (empty data dir). To rotate:

1. Stop stack: `docker compose --env-file .env down`
2. Backup then clear `/apps/monitoring/data`
3. Update `OPENOBSERVE_ROOT_PASSWORD` in GitHub
4. Re-run deploy workflow
