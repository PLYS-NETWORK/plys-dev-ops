#!/usr/bin/env node
/**
 * Regenerates OpenObserve KPI dashboard JSON under monitoring/dashboards/.
 * Run: node scripts/generate-kpi-dashboards.mjs
 */
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { dashboardV8, sqlPanel } from '../monitoring/dashboards/_panel-helper.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = join(root, 'monitoring', 'dashboards');

const platform = dashboardV8({
  title: 'Plys Platform KPIs',
  description: 'Ops KPIs: throughput, errors, latency, versions (org plys)',
  panels: [
    sqlPanel({
      id: 'platform_request_volume',
      title: 'Request volume (5m)',
      type: 'line',
      stream: 'api-gateway',
      sql: `SELECT histogram(_timestamp, '5 minute') AS ts, count(*) AS requests
FROM "api-gateway"
WHERE log_type = 'access'
GROUP BY ts
ORDER BY ts ASC`,
      layout: { x: 0, y: 0, w: 48, h: 15, i: 0 },
    }),
    sqlPanel({
      id: 'platform_error_rate',
      title: '5xx error rate %',
      type: 'line',
      stream: 'api-gateway',
      sql: `SELECT histogram(_timestamp, '5 minute') AS ts,
  100.0 * count(CASE WHEN status_code >= 500 THEN 1 END) / count(*) AS error_rate_pct
FROM "api-gateway"
WHERE log_type = 'access'
GROUP BY ts
ORDER BY ts ASC`,
      layout: { x: 48, y: 0, w: 48, h: 15, i: 1 },
    }),
    sqlPanel({
      id: 'platform_p95_latency',
      title: 'p95 latency by path (top 10)',
      type: 'table',
      stream: 'api-gateway',
      sql: `SELECT path,
  approx_percentile_cont(duration_ms, 0.95) AS p95_ms,
  count(*) AS requests
FROM "api-gateway"
WHERE log_type = 'access' AND duration_ms IS NOT NULL AND path IS NOT NULL
GROUP BY path
ORDER BY p95_ms DESC
LIMIT 10`,
      layout: { x: 0, y: 15, w: 48, h: 15, i: 2 },
    }),
    sqlPanel({
      id: 'platform_http_errors_by_service',
      title: '4xx/5xx by service',
      type: 'bar',
      stream: 'default',
      sql: `SELECT service,
  count(CASE WHEN status_code BETWEEN 400 AND 499 THEN 1 END) AS client_errors,
  count(CASE WHEN status_code >= 500 THEN 1 END) AS server_errors
FROM "default"
WHERE log_type = 'access' AND status_code >= 400
GROUP BY service
ORDER BY server_errors DESC`,
      layout: { x: 48, y: 15, w: 48, h: 15, i: 3 },
    }),
    sqlPanel({
      id: 'platform_grpc_failures',
      title: 'gRPC upstream failures',
      type: 'line',
      stream: 'default',
      sql: `SELECT histogram(_timestamp, '5 minute') AS ts, count(*) AS failures
FROM "default"
WHERE log_type = 'grpc' AND outcome = 'failure'
GROUP BY ts
ORDER BY ts ASC`,
      layout: { x: 0, y: 30, w: 48, h: 15, i: 4 },
    }),
    sqlPanel({
      id: 'platform_active_versions',
      title: 'Active service versions',
      type: 'table',
      stream: 'default',
      sql: `SELECT service, service_version, libraries_version, count(*) AS log_lines
FROM "default"
WHERE service_version IS NOT NULL
GROUP BY service, service_version, libraries_version
ORDER BY service, service_version DESC`,
      layout: { x: 48, y: 30, w: 48, h: 15, i: 5 },
    }),
    sqlPanel({
      id: 'platform_errors_by_version',
      title: 'Errors by service version',
      type: 'bar',
      stream: 'default',
      sql: `SELECT service, service_version, count(*) AS errors
FROM "default"
WHERE log_type = 'error'
GROUP BY service, service_version
ORDER BY errors DESC
LIMIT 20`,
      layout: { x: 0, y: 45, w: 96, h: 15, i: 6 },
    }),
  ],
});

const securityAudit = dashboardV8({
  title: 'Plys Security & Audit KPIs',
  description: 'Auth funnel, admin actions, failed login offenders (org plys)',
  panels: [
    sqlPanel({
      id: 'audit_login_outcomes',
      title: 'Login success vs failure',
      type: 'bar',
      stream: 'identity-service',
      sql: `SELECT outcome, count(*) AS events
FROM "identity-service"
WHERE log_type = 'audit' AND action = 'login'
GROUP BY outcome
ORDER BY events DESC`,
      layout: { x: 0, y: 0, w: 48, h: 15, i: 0 },
    }),
    sqlPanel({
      id: 'audit_failed_login_reasons',
      title: 'Failed login by reason',
      type: 'table',
      stream: 'identity-service',
      sql: `SELECT reason, count(*) AS failures
FROM "identity-service"
WHERE log_type = 'audit' AND action = 'login' AND outcome = 'failure'
GROUP BY reason
ORDER BY failures DESC`,
      layout: { x: 48, y: 0, w: 48, h: 15, i: 1 },
    }),
    sqlPanel({
      id: 'audit_register_funnel',
      title: 'Register / verify_email funnel',
      type: 'line',
      stream: 'identity-service',
      sql: `SELECT histogram(_timestamp, '1 hour') AS ts,
  count(CASE WHEN action = 'register' AND outcome = 'success' THEN 1 END) AS registrations,
  count(CASE WHEN action = 'verify_email' AND outcome = 'success' THEN 1 END) AS verifications
FROM "identity-service"
WHERE log_type = 'audit' AND action IN ('register', 'verify_email')
GROUP BY ts
ORDER BY ts ASC`,
      layout: { x: 0, y: 15, w: 48, h: 15, i: 2 },
    }),
    sqlPanel({
      id: 'audit_admin_actions',
      title: 'Admin actions timeline',
      type: 'line',
      stream: 'internal-admin-service',
      sql: `SELECT histogram(_timestamp, '1 hour') AS ts, action, count(*) AS events
FROM "internal-admin-service"
WHERE log_type = 'audit' AND event_category = 'admin'
GROUP BY ts, action
ORDER BY ts ASC`,
      layout: { x: 48, y: 15, w: 48, h: 15, i: 3 },
    }),
    sqlPanel({
      id: 'audit_failed_login_ips',
      title: 'Top IPs with failed logins',
      type: 'table',
      stream: 'identity-service',
      sql: `SELECT ip_address, count(*) AS failures
FROM "identity-service"
WHERE log_type = 'audit' AND action = 'login' AND outcome = 'failure' AND ip_address IS NOT NULL
GROUP BY ip_address
ORDER BY failures DESC
LIMIT 15`,
      layout: { x: 0, y: 30, w: 96, h: 15, i: 4 },
    }),
  ],
});

const business = dashboardV8({
  title: 'Plys Business KPIs',
  description: 'Finance, projects, notifications volume (org plys)',
  panels: [
    sqlPanel({
      id: 'biz_withdraw_volume',
      title: 'Withdraw create / cancel',
      type: 'line',
      stream: 'finance-service',
      sql: `SELECT histogram(_timestamp, '1 hour') AS ts,
  count(CASE WHEN action = 'withdraw_create' THEN 1 END) AS creates,
  count(CASE WHEN action = 'withdraw_cancel' THEN 1 END) AS cancels
FROM "finance-service"
WHERE log_type = 'audit' AND action IN ('withdraw_create', 'withdraw_cancel')
GROUP BY ts
ORDER BY ts ASC`,
      layout: { x: 0, y: 0, w: 48, h: 15, i: 0 },
    }),
    sqlPanel({
      id: 'biz_webhook_outcomes',
      title: 'Stripe / Polar webhooks',
      type: 'bar',
      stream: 'finance-service',
      sql: `SELECT action, outcome, count(*) AS events
FROM "finance-service"
WHERE log_type = 'audit' AND action IN ('webhook_stripe', 'webhook_polar')
GROUP BY action, outcome
ORDER BY events DESC`,
      layout: { x: 48, y: 0, w: 48, h: 15, i: 1 },
    }),
    sqlPanel({
      id: 'biz_project_publish',
      title: 'Project publish / republish',
      type: 'line',
      stream: 'business-service',
      sql: `SELECT histogram(_timestamp, '1 hour') AS ts,
  count(CASE WHEN action = 'project_publish' THEN 1 END) AS publishes,
  count(CASE WHEN action = 'project_republish' THEN 1 END) AS republishes
FROM "business-service"
WHERE log_type = 'audit' AND action IN ('project_publish', 'project_republish')
GROUP BY ts
ORDER BY ts ASC`,
      layout: { x: 0, y: 15, w: 48, h: 15, i: 2 },
    }),
    sqlPanel({
      id: 'biz_notifications',
      title: 'Notification send volume',
      type: 'line',
      stream: 'notifications-service',
      sql: `SELECT histogram(_timestamp, '1 hour') AS ts, outcome, count(*) AS sends
FROM "notifications-service"
WHERE log_type = 'audit' AND action = 'notification_send'
GROUP BY ts, outcome
ORDER BY ts ASC`,
      layout: { x: 48, y: 15, w: 48, h: 15, i: 3 },
    }),
    sqlPanel({
      id: 'biz_settlement_triggers',
      title: 'Settlement triggers',
      type: 'bar',
      stream: 'finance-service',
      sql: `SELECT histogram(_timestamp, '1 day') AS ts, count(*) AS triggers
FROM "finance-service"
WHERE log_type = 'audit' AND action = 'settlement_trigger' AND outcome = 'success'
GROUP BY ts
ORDER BY ts ASC`,
      layout: { x: 0, y: 30, w: 96, h: 15, i: 4 },
    }),
  ],
});

for (const [name, payload] of [
  ['platform-kpis', platform],
  ['security-audit-kpis', securityAudit],
  ['business-kpis', business],
]) {
  const path = join(outDir, `${name}.json`);
  writeFileSync(path, `${JSON.stringify(payload, null, 2)}\n`);
  console.log(`wrote ${path}`);
}
