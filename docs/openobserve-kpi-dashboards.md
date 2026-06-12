# OpenObserve KPI dashboards

Importable SQL dashboards for org **`plys`** on each VPS. They rely on structured log fields from the backend (`log_type`, `action`, `outcome`, `service_version`, etc.).

| Dashboard | File | Focus |
|-----------|------|--------|
| Platform KPIs | [`monitoring/dashboards/platform-kpis.json`](../monitoring/dashboards/platform-kpis.json) | Throughput, 5xx rate, latency, versions |
| Security & Audit | [`monitoring/dashboards/security-audit-kpis.json`](../monitoring/dashboards/security-audit-kpis.json) | Login funnel, admin actions, failed-login IPs |
| Business KPIs | [`monitoring/dashboards/business-kpis.json`](../monitoring/dashboards/business-kpis.json) | Withdrawals, webhooks, projects, notifications |

Regenerate JSON after editing panel definitions:

```bash
node scripts/generate-kpi-dashboards.mjs
```

---

## Prerequisites

1. Backend deployed with audit logging (Pino + `AppLogger.audit()`).
2. OpenObserve running on the VPS ([`vps-started/06-monitoring-openobserve.md`](vps-started/06-monitoring-openobserve.md)).
3. At least 10+ minutes of traffic so panels have data.

---

## Import on dev (`observe-dev.plyshub.space`)

1. Sign in to **https://observe-dev.plyshub.space** with `huuphuc9410@gmail.com` and the dev `OPENOBSERVE_ROOT_PASSWORD`.
2. Confirm org **`plys`** is selected.
3. **Dashboards** → create folder **`plys-kpis`** (or use an existing folder).
4. For each JSON file in `monitoring/dashboards/`:
   - **Import** → upload the file.
   - Choose folder **`plys-kpis`**.
5. Open each dashboard and verify panels return rows (adjust time range to **Last 15 minutes** or **Last 1 hour**).

---

## Import on prod (`observe.plyshub.space`)

Repeat the same steps on **https://observe.plyshub.space** using the **production** `OPENOBSERVE_ROOT_PASSWORD`. Dev and prod are separate instances — import on both after validating SQL on dev.

---

## Stream names

Panels query log streams by service name (e.g. `"api-gateway"`, `"identity-service"`). Cross-service panels use `"default"` with a `service` field filter.

If a panel is empty after import:

1. **Logs** → pick a stream → confirm field names (`log_type`, `action`, `service`, `status_code`).
2. Edit the panel SQL to match your stream layout (OTLP vs PM2 filelog may differ slightly).
3. Re-export from dev once tuned and re-import to prod.

---

## Useful log filters

| Goal | Filter |
|------|--------|
| Audit trail for a user | `log_type = 'audit' AND user_id = '<uuid>'` |
| Failed logins | `log_type = 'audit' AND action = 'login' AND outcome = 'failure'` |
| Deploy version mix | `SELECT service, service_version, COUNT(*) GROUP BY service, service_version` |
| HTTP errors | `log_type = 'access' AND status_code >= 500` |

---

## Starter alerts (configure in OpenObserve UI)

| Alert | Condition (SQL / filter) |
|-------|---------------------------|
| High 5xx rate | `log_type = 'access'`, `status_code >= 500`, count over threshold per 5m on `api-gateway` |
| Login failure spike | `log_type = 'audit' AND action = 'login' AND outcome = 'failure'` |
| Webhook failures | `log_type = 'audit' AND event_category = 'finance' AND outcome = 'failure'` |

---

## Optional: API import

A follow-up script can POST dashboards via `POST /api/plys/dashboards` with the same Basic Auth used by the monitoring stack. Until then, use UI import.
