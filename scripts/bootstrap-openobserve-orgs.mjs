#!/usr/bin/env node
/**
 * Bootstrap OpenObserve orgs for the 4-product layout.
 *
 * Usage (on VPS with OpenObserve running on loopback):
 *   set -a && source /apps/monitoring/current/.env && set +a
 *   node scripts/bootstrap-openobserve-orgs.mjs
 *
 * Optional:
 *   OPENOBSERVE_BASE_URL=http://127.0.0.1:5080 node scripts/bootstrap-openobserve-orgs.mjs --dry-run
 */

const ORGS = ['internal-hub-api', 'internal-hub-fe', 'ployos-fe', 'lonaos-fe'];

const ROOT_EMAIL = process.env.ZO_ROOT_USER_EMAIL ?? 'huuphuc9410@gmail.com';
const ROOT_PASSWORD = process.env.ZO_ROOT_USER_PASSWORD ?? process.env.OPENOBSERVE_ROOT_PASSWORD ?? '';
const BASE_URL = (process.env.OPENOBSERVE_BASE_URL ?? 'http://127.0.0.1:5080').replace(/\/$/, '');

function parseArgs(argv) {
  return { dryRun: argv.includes('--dry-run') };
}

function authHeader() {
  if (!ROOT_PASSWORD) {
    throw new Error('Set ZO_ROOT_USER_PASSWORD or OPENOBSERVE_ROOT_PASSWORD before running.');
  }
  const token = Buffer.from(`${ROOT_EMAIL}:${ROOT_PASSWORD}`, 'utf8').toString('base64');
  return `Basic ${token}`;
}

async function listOrgs() {
  const res = await fetch(`${BASE_URL}/api/organizations`, {
    headers: { Authorization: authHeader(), Accept: 'application/json' },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`list orgs failed (${res.status}): ${body}`);
  }
  const data = await res.json();
  if (Array.isArray(data)) return data.map((o) => o.name ?? o.identifier ?? o);
  if (Array.isArray(data?.data)) return data.data.map((o) => o.name ?? o.identifier ?? o);
  return [];
}

async function createOrg(name) {
  const res = await fetch(`${BASE_URL}/api/organizations`, {
    method: 'POST',
    headers: {
      Authorization: authHeader(),
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({ name }),
  });
  if (res.ok) return;
  const body = await res.text();
  if (res.status === 409 || body.toLowerCase().includes('already')) return;
  throw new Error(`create org "${name}" failed (${res.status}): ${body}`);
}

async function smokeIngest(org) {
  const res = await fetch(`${BASE_URL}/api/${org}/default/_json`, {
    method: 'POST',
    headers: {
      Authorization: authHeader(),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ level: 'info', message: `org smoke test: ${org}` }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`smoke ingest "${org}" failed (${res.status}): ${body}`);
  }
}

async function main() {
  const { dryRun } = parseArgs(process.argv);
  console.log(`OpenObserve base: ${BASE_URL}`);
  console.log(`Target orgs: ${ORGS.join(', ')}`);

  if (dryRun) {
    console.log('Dry run — no API calls.');
    for (const org of ORGS) {
      console.log(`curl -sf -u "${ROOT_EMAIL}:\$ZO_ROOT_USER_PASSWORD" \\`);
      console.log(`  -H "Content-Type: application/json" \\`);
      console.log(`  -d '{"level":"info","message":"org smoke test"}' \\`);
      console.log(`  "${BASE_URL}/api/${org}/default/_json"`);
    }
    return;
  }

  const existing = new Set(await listOrgs());
  for (const org of ORGS) {
    if (existing.has(org)) {
      console.log(`skip (exists): ${org}`);
      continue;
    }
    await createOrg(org);
    console.log(`created: ${org}`);
  }

  for (const org of ORGS) {
    await smokeIngest(org);
    console.log(`smoke OK: ${org}`);
  }
}

try {
  await main();
} catch (err) {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
}
