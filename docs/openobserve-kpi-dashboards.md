# OpenObserve KPI dashboards

Importable SQL dashboards for **four OpenObserve orgs** on each VPS. Backend KPIs use org **`internal-hub-api`**; frontend warn/error dashboards use **`internal-hub-fe`**, **`ployos-fe`**, and **`lonaos-fe`**.

| Dashboard | File | Org | Focus |
|-----------|------|-----|--------|
| Platform KPIs | [`monitoring/dashboards/platform-kpis.json`](../monitoring/dashboards/platform-kpis.json) | `internal-hub-api` | Throughput, 5xx rate, latency, versions |
| Security & Audit | [`monitoring/dashboards/security-audit-kpis.json`](../monitoring/dashboards/security-audit-kpis.json) | `internal-hub-api` | Login funnel, admin actions, failed-login IPs |
| Business KPIs | [`monitoring/dashboards/business-kpis.json`](../monitoring/dashboards/business-kpis.json) | `internal-hub-api` | Withdrawals, webhooks, projects, notifications |
| FE Errors & Warnings | [`monitoring/dashboards/fe-errors-warnings-internal-hub-fe.json`](../monitoring/dashboards/fe-errors-warnings-internal-hub-fe.json) | `internal-hub-fe` | Warn/error volume, recent errors |
| FE Errors & Warnings | [`monitoring/dashboards/fe-errors-warnings-ployos-fe.json`](../monitoring/dashboards/fe-errors-warnings-ployos-fe.json) | `ployos-fe` | Warn/error volume, recent errors |
| FE Errors & Warnings | [`monitoring/dashboards/fe-errors-warnings-lonaos-fe.json`](../monitoring/dashboards/fe-errors-warnings-lonaos-fe.json) | `lonaos-fe` | Warn/error volume, recent errors |

Regenerate JSON after editing panel definitions:

```bash
node scripts/generate-kpi-dashboards.mjs
```

---

## Prerequisites

1. Backend deployed with structured logging (Pino + `AppLogger` with `level`, `severity_text`, `log_type`).
2. OpenObserve + OTEL collector running ([`vps-started/06-monitoring-openobserve.md`](vps-started/06-monitoring-openobserve.md)) — four orgs bootstrapped; collector routes by `service.name`.
3. PM2 log names: `{service}-out[-{id}].log` (stable slug, no version suffix).
4. Traffic after monitoring deploy (collector uses `start_at: end`; only **new** log lines are shipped).

Bootstrap orgs on VPS (once per instance):

```bash
set -a && source /apps/monitoring/current/.env && set +a
node /path/to/plys-dev-ops/scripts/bootstrap-openobserve-orgs.mjs
```

---

## Import on dev (`observe-dev.plyshub.space`)

1. Sign in with `huuphuc9410@gmail.com` and dev `OPENOBSERVE_ROOT_PASSWORD`.
2. **Backend KPIs** — select org **`internal-hub-api`** → **Dashboards** → create folder **`internal-hub-api-kpis`** → import `platform-kpis.json`, `security-audit-kpis.json`, `business-kpis.json`.
3. **Frontend** — for each org (`internal-hub-fe`, `ployos-fe`, `lonaos-fe`): select org → create folder **`{org}-kpis`** → import matching `fe-errors-warnings-*.json`.
4. Verify panels return rows (**Last 15 minutes** or **Last 1 hour**).

If import fails:

| Error | Fix |
|-------|-----|
| **Dashboard ID is required** / **missing layout.i** | `node scripts/generate-kpi-dashboards.mjs` — `layout.i` must be integer ≥ 1 |
| **422** on import | Create target folder in OpenObserve before import |

Repeat on **prod** (`observe.plyshub.space`) with production password.

---

## Stream names

Panels query streams by stable `service.name` (e.g. `"api-gateway"`, `"identity-service"`). Cross-service panels use `"default"` with a `service` field filter.

Structured fields for KPI SQL: `log_type`, `level`, `severity_text`, `action`, `outcome`, `service`, `status_code`.

---

## Useful log filters

| Goal | Filter |
|------|--------|
| Audit trail for a user | `log_type = 'audit' AND user_id = '<uuid>'` |
| Failed logins | `log_type = 'audit' AND action = 'login' AND outcome = 'failure'` |
| HTTP errors | `log_type = 'access' AND status_code >= 500` |
| FE warnings/errors | `level IN ('warn', 'error')` or `severity_text IN ('WARN', 'ERROR')` |

---

## Alert: API 5xx rate → Slack

Configure in org **`internal-hub-api`** on each host (dev and prod separately).

1. Monitoring stack running with org routing ([06-monitoring-openobserve.md](vps-started/06-monitoring-openobserve.md)).
2. Platform KPIs imported; **5xx error rate %** panel returns data for stream **`api-gateway`**.
3. Confirm `log_type = 'access'` and `status_code` in **Logs → `api-gateway`**.

**Alert rule SQL** (stream `api-gateway`, org `internal-hub-api`):

```sql
SELECT
  100.0 * count(CASE WHEN status_code >= 500 THEN 1 END) / count(*) AS error_rate_pct,
  count(*) AS total_requests,
  count(CASE WHEN status_code >= 500 THEN 1 END) AS errors_5xx
FROM "api-gateway"
WHERE log_type = 'access'
HAVING error_rate_pct > 1.0 AND total_requests >= 10
```

Use folder **`internal-hub-api-kpis`** for alert rules. See prior Slack template/destination steps in git history or OpenObserve docs for webhook setup.

---

## Migration from legacy org `plys`

1. Deploy updated collector (routes to four orgs) **before** deleting `plys`.
2. Run `scripts/bootstrap-openobserve-orgs.mjs` on each VPS.
3. Validate live streams in each new org (15+ min traffic).
4. Re-import dashboards and recreate alerts per org.
5. After validation, archive or delete org `plys` in OpenObserve UI.

---

## Optional: API import

POST dashboards via `POST /api/<org>/dashboards` with Basic Auth. Until automated, use UI import.
