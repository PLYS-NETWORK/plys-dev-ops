# GitHub setup — three monorepos (production)

**Track:** [deploy-prod](README.md) · Configure **before** first prod deploy.

Use GitHub **Environment `production`** on each repo. Prod deploy workflows are **manual** — type `deploy` to confirm.

---

## 1. Organization (one-time)

| Step | Where | Action |
|------|-------|--------|
| 1.1 | Org → **Settings** → **Actions** → **Runner groups** | Create `plys-prod-runners` — [runner guide §4](../vps-started/02-self-hosted-runner.md#4-organization-runner-groups-dev--prod) |
| 1.2 | Same group | **Repository access:** `plys-internal-hub-service-api`, `plys-internal-hub`, `plys-monorepo-webapps` |
| 1.3 | Same group | **Workflow access:** prod deploy workflows on `refs/heads/main` — [§4.7](../vps-started/02-self-hosted-runner.md#47-workflow-access--full-copy-paste-lists) |
| 1.4 | Prod VPS | Register runner with `--runnergroup plys-prod-runners` — [§5–6](../vps-started/02-self-hosted-runner.md#5-register-runner) |

---

## 2. Create GitHub Environment `production` (each repo)

For **each** of the three repos:

1. **Settings** → **Environments** → **New environment** → name: `production`
2. **Required reviewers** — enable (recommended: 1+ approvers for prod deploys)
3. *(Optional)* Deployment branch rule: `main` only
4. Add secrets from §3–§5 (use **prod** VPS `/apps/.env.data` passwords, **distinct** from dev)

Deploy workflows use `environment: production` and `runs-on.group: plys-prod-runners`.

---

## 3. `plys-internal-hub-service-api`

**Environment:** `production`  
**Deploy workflows:** `deploy-prod.yml`, `deploy-prod.*.yml` (manual, confirm `deploy`)  
**VPS path:** `/apps/internal-hub-be/prod/current`

### 3.1 Required secrets

| Secret | Source / how to set |
|--------|---------------------|
| `DB_PASSWORD` | Same as `POSTGRES_PROD_PASSWORD` in VPS `/apps/.env.data` ([§2](01-deploy.md#2-postgres--redis-prod-only)) |
| `REDIS_PASSWORD` | Same as `REDIS_PROD_PASSWORD` in `/apps/.env.data` |
| `JWT_ACCESS_SECRET` | **New** prod value — `openssl rand -base64 48` (do not reuse dev) |
| `JWT_REFRESH_SECRET` | **New** prod value — `openssl rand -base64 48` |
| `PUBLIC_ENDPOINT_API_KEY` | **New** prod value — `openssl rand -hex 32` |
| `GRPC_SERVICE_SECRET` | **New** prod value — `openssl rand -base64 32` |
| `RESEND_API_KEY` | Production Resend key |
| `POLAR_ACCESS_TOKEN` | Production Polar token |
| `POLAR_WEBHOOK_SECRET` | Production Polar webhook secret |
| `AWS_S3_ACCESS_KEY_ID` | Production object storage |
| `AWS_S3_SECRET_ACCESS_KEY` | Paired with prod access key |
| `AI_KEYS_MASTER_KEY_v1` | **New** prod value — `openssl rand -base64 32` |

### 3.2 Optional secrets

| Secret | When needed |
|--------|-------------|
| `SSO_TOKEN_ENCRYPTION_KEY` | SSO features |
| `STRIPE_SECRET_KEY` | Stripe live mode |
| `STRIPE_WEBHOOK_SECRET` | Stripe live webhooks |
| `GOOGLE_CLIENT_SECRET` | Google OAuth |
| `COPYLEAKS_API_KEY` | Copyleaks |

### 3.3 Deploy-only

| Secret | Notes |
|--------|-------|
| `GHCR_PULL_TOKEN` | Only if prod runner needs PAT for private GHCR pulls |

### 3.4 Remove (legacy)

`VPS_HOST`, `VPS_USER`, `VPS_SSH_KEY`, `VPS_SSH_PORT`

---

## 4. `plys-internal-hub`

**Environment:** `production`  
**Deploy workflows:** `deploy-prod-internal-*.yml`, `deploy-prod-all.yml`  
**VPS path:** `/apps/internal-hub-fe/prod/current`

### 4.1 Required secrets

| Secret | How to set |
|--------|------------|
| `AUTH_SECRET` | **New** prod value — `openssl rand -base64 32` (not dev `AUTH_SECRET`) |

### 4.2 Optional

| Secret | Notes |
|--------|-------|
| `GHCR_PULL_TOKEN` | Private GHCR pulls on prod runner |

### 4.3 Remove (legacy)

`VPS_HOST`, `VPS_USER`, `VPS_SSH_KEY`, `VPS_SSH_PORT`

---

## 5. `plys-monorepo-webapps`

**Environment:** `production`  
**Deploy workflows:** `deploy-prod-*.yml`, `deploy-prod-all.yml`  
**VPS path:** `/apps/plys-webapps/prod/current`

### 5.1 Required secrets

| Secret | How to set |
|--------|------------|
| `AUTH_SECRET` | **New** prod value — `openssl rand -base64 32` |
| `PUBLIC_ENDPOINT_API_KEY` | **New** prod value — align with backend prod `PUBLIC_ENDPOINT_API_KEY` |

### 5.2 Optional secrets

| Secret | When needed |
|--------|-------------|
| `GOOGLE_CLIENT_ID` | Production OAuth client |
| `GOOGLE_CLIENT_SECRET` | Production OAuth secret |
| `GHCR_PULL_TOKEN` | Private GHCR pulls |

### 5.3 Remove (legacy)

`VPS_HOST`, `VPS_USER`, `VPS_SSH_KEY`, `VPS_SSH_PORT`

---

## 6. Production safety checklist

| Check | All three repos |
|-------|-----------------|
| Environment `production` has **required reviewers** | ✓ |
| Prod secrets **≠** dev secrets (especially `AUTH_SECRET`, JWT, API keys) | ✓ |
| `DB_PASSWORD` / `REDIS_PASSWORD` match **prod** `/apps/.env.data` only | ✓ |
| No `VPS_*` secrets on `production` environment | ✓ |
| Workflow dispatch requires typing `deploy` | ✓ (built into prod workflows) |
| Runner group `plys-prod-runners` — prod VPS only | ✓ |

---

## 7. First prod deploy order

After VPS [01-deploy.md](01-deploy.md) §2–§6 and secrets above:

| Order | Repo | Workflow |
|-------|------|----------|
| 1 | `plys-internal-hub-service-api` | **Deploy Prod** — confirm `deploy` |
| 2 | `plys-internal-hub` | Deploy Prod per app (or `deploy-prod-all.yml`) |
| 3 | `plys-monorepo-webapps` | Deploy Prod per app (or `deploy-prod-all.yml`) |

Runner group: `plys-prod-runners` · Branch: `main`

---

## 8. Verify secrets locally

```bash
cd plys-internal-hub-service-api
export DB_PASSWORD=... REDIS_PASSWORD=...  # prod values only
node scripts/render-deploy-env.mjs --deploy-env prod --output /tmp/.env.prod
```

[← Deploy guide](01-deploy.md) · [Dev GitHub setup](../deploy-dev/02-github-monorepos.md)
