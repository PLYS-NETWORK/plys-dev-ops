#!/usr/bin/env node
/**
 * Renders monitoring deploy .env from env.example + GitHub secret OPENOBSERVE_ROOT_PASSWORD.
 *
 * Usage:
 *   OPENOBSERVE_ROOT_PASSWORD=secret node scripts/render-monitoring-env.mjs --deploy-env dev
 *   OPENOBSERVE_ROOT_PASSWORD=secret node scripts/render-monitoring-env.mjs --deploy-env prod --output deploy/.env
 */

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

const ROOT_EMAIL = 'huuphuc9410@gmail.com';
const VALID_DEPLOY_ENVS = new Set(['dev', 'prod', 'combined']);

function parseArgs(argv) {
  let deployEnv = 'dev';
  let output = join(ROOT, 'deploy', '.env');

  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--deploy-env' && argv[i + 1]) {
      deployEnv = argv[++i];
    } else if (arg === '--output' && argv[i + 1]) {
      output = argv[++i];
    } else if (arg === '--help' || arg === '-h') {
      console.log(`Usage: OPENOBSERVE_ROOT_PASSWORD=... node scripts/render-monitoring-env.mjs --deploy-env dev|prod|combined [--output path]`);
      process.exit(0);
    }
  }

  return { deployEnv, output };
}

function validatePassword(password) {
  if (!password || password.trim() === '') {
    throw new Error('OPENOBSERVE_ROOT_PASSWORD is required (set as env var or GitHub secret).');
  }
  if (password.includes('#')) {
    throw new Error('OPENOBSERVE_ROOT_PASSWORD must not contain "#" (breaks Docker env injection).');
  }
  if (password.includes('$')) {
    throw new Error('OPENOBSERVE_ROOT_PASSWORD must not contain "$" (breaks Docker env substitution).');
  }
}

function parseEnvExample(content) {
  const vars = {};
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim();
    vars[key] = value;
  }
  return vars;
}

function serializeEnv(vars) {
  const lines = [
    '# Rendered by scripts/render-monitoring-env.mjs — do not commit.',
    `ZO_ROOT_USER_EMAIL=${vars.ZO_ROOT_USER_EMAIL}`,
    `ZO_ROOT_USER_PASSWORD=${vars.ZO_ROOT_USER_PASSWORD}`,
    `OPENOBSERVE_AUTH_B64=${vars.OPENOBSERVE_AUTH_B64}`,
    `OPENOBSERVE_ORG=${vars.OPENOBSERVE_ORG}`,
    `DEPLOY_ENV=${vars.DEPLOY_ENV}`,
    `OPENOBSERVE_DATA_DIR=${vars.OPENOBSERVE_DATA_DIR}`,
    '',
  ];
  return lines.join('\n');
}

function main() {
  const { deployEnv, output } = parseArgs(process.argv);

  if (!VALID_DEPLOY_ENVS.has(deployEnv)) {
    throw new Error(`Invalid --deploy-env "${deployEnv}" (expected dev, prod, or combined).`);
  }

  const password = process.env.OPENOBSERVE_ROOT_PASSWORD ?? '';
  validatePassword(password);

  const examplePath = join(ROOT, 'monitoring', 'env.example');
  const vars = parseEnvExample(readFileSync(examplePath, 'utf8'));

  vars.ZO_ROOT_USER_EMAIL = ROOT_EMAIL;
  vars.ZO_ROOT_USER_PASSWORD = password;
  vars.OPENOBSERVE_AUTH_B64 = Buffer.from(`${ROOT_EMAIL}:${password}`, 'utf8').toString('base64');
  vars.OPENOBSERVE_ORG = vars.OPENOBSERVE_ORG || 'plys';
  vars.DEPLOY_ENV = deployEnv;
  vars.OPENOBSERVE_DATA_DIR = vars.OPENOBSERVE_DATA_DIR || '/apps/monitoring/data';

  mkdirSync(dirname(output), { recursive: true });
  // 0644 so CI tar/scp (often a different container user) can read the file before upload.
  writeFileSync(output, serializeEnv(vars), { mode: 0o644 });

  console.log(`Rendered ${output} (deploy_env=${deployEnv}, org=${vars.OPENOBSERVE_ORG})`);
}

try {
  main();
} catch (err) {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
}
