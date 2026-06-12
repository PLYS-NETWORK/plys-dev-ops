# GitHub setup — three monorepos (dev)

**Track:** [deploy-dev](README.md) · Configure **before** first deploy workflow run.

Set secrets on each repository under GitHub **Environment `dev`** (not repository-level secrets), unless noted. Source of truth per repo: `infra/env/secrets.list` and `infra/env/secrets-optional.list`.

---

## 1. Organization (one-time)

| Step | Where | Action |
|------|-------|--------|
| 1.1 | Org → **Settings** → **Actions** → **Runner groups** | Create `plys-dev-runners` — [runner guide §4](../vps-started/02-self-hosted-runner.md#4-organization-runner-groups-dev--prod) |
| 1.2 | Same group | **Repository access:** `plys-internal-hub-service-api`, `plys-internal-hub`, `plys-monorepo-webapps` |
| 1.3 | Same group | **Workflow access:** dev deploy workflows on `refs/heads/develop` — [§4.7 full list](../vps-started/02-self-hosted-runner.md#47-workflow-access--full-copy-paste-lists) |
| 1.4 | Dev VPS | Register runner with `--runnergroup plys-dev-runners` — [§5–6](../vps-started/02-self-hosted-runner.md#5-register-runner) |

---

## 2. Create GitHub Environment `dev` (each repo)

For **each** of the three repos:

1. **Settings** → **Environments** → **New environment** → name: `dev`
2. *(Optional)* Add deployment branch rule: `develop` only
3. Add secrets from the tables below (§3–§5)

Deploy workflows use `environment: dev` and `runs-on.group: plys-dev-runners`.

---

## 3. `plys-internal-hub-service-api`

**Repo:** [github.com/PLYS-NETWORK/plys-internal-hub-service-api](https://github.com/PLYS-NETWORK/plys-internal-hub-service-api)  
**Environment:** `dev`  
**Deploy workflows:** `deploy-dev.yml`, `deploy-dev.*.yml`  
**VPS path:** `/apps/internal-hub-be/dev/current`

### 3.1 Required secrets

| Secret | Source / how to set |
|--------|---------------------|
| `DB_PASSWORD` | Same value as `POSTGRES_DEV_PASSWORD` in VPS `/apps/.env.data` ([§2 of deploy guide](01-deploy.md#2-postgres--redis-dev-only)) |
| `REDIS_PASSWORD` | Same value as `REDIS_DEV_PASSWORD` in `/apps/.env.data` |
| `JWT_ACCESS_SECRET` | `openssl rand -base64 48` |
| `JWT_REFRESH_SECRET` | `openssl rand -base64 48` (must differ from access secret) |
| `PUBLIC_ENDPOINT_API_KEY` | `openssl rand -hex 32` |
| `GRPC_SERVICE_SECRET` | `openssl rand -base64 32` |
| `RESEND_API_KEY` | Resend dashboard (if email enabled) |
| `POLAR_ACCESS_TOKEN` | Polar.sh API token (if billing enabled) |
| `POLAR_WEBHOOK_SECRET` | Polar webhook signing secret |
| `AWS_S3_ACCESS_KEY_ID` | S3-compatible storage (if uploads enabled) |
| `AWS_S3_SECRET_ACCESS_KEY` | Paired with access key above |
| `AI_KEYS_MASTER_KEY_v1` | `openssl rand -base64 32` |

### 3.2 Optional secrets

Missing values do not fail deploy env rendering (`infra/env/secrets-optional.list`):

| Secret | When needed |
|--------|-------------|
| `SSO_TOKEN_ENCRYPTION_KEY` | SSO / token encryption features |
| `STRIPE_SECRET_KEY` | Stripe payments |
| `STRIPE_WEBHOOK_SECRET` | Stripe webhooks |
| `GOOGLE_CLIENT_SECRET` | Google OAuth on backend |
| `COPYLEAKS_API_KEY` | Copyleaks integration |

### 3.3 Deploy-only secret

| Secret | Notes |
|--------|-------|
| `GHCR_PULL_TOKEN` | PAT with `read:packages` — only if the dev runner cannot pull private GHCR images with `GITHUB_TOKEN` alone |

### 3.4 Remove (legacy SSH deploy)

Delete from environment `dev` if still present:

- `VPS_HOST`, `VPS_USER`, `VPS_SSH_KEY`, `VPS_SSH_PORT`

---

## 4. `plys-internal-hub`

**Repo:** `plys-internal-hub`  
**Environment:** `dev`  
**Deploy workflows:** `deploy-dev-internal-*.yml`, `deploy-dev-all.yml`  
**VPS path:** `/apps/internal-hub-fe/dev/current`

### 4.1 Required secrets

| Secret | How to set |
|--------|------------|
| `AUTH_SECRET` | `openssl rand -base64 32` — NextAuth / session signing |

### 4.2 Optional

| Secret | Notes |
|--------|-------|
| `GHCR_PULL_TOKEN` | Same as §3.3 — private image pulls on runner |

### 4.3 Remove (legacy)

`VPS_HOST`, `VPS_USER`, `VPS_SSH_KEY`, `VPS_SSH_PORT`

---

## 5. `plys-monorepo-webapps`

**Repo:** `plys-monorepo-webapps`  
**Environment:** `dev`  
**Deploy workflows:** `deploy-dev-*.yml`, `deploy-dev-all.yml`  
**VPS path:** `/apps/plys-webapps/dev/current`

### 5.1 Required secrets

| Secret | How to set |
|--------|------------|
| `AUTH_SECRET` | `openssl rand -base64 32` |
| `PUBLIC_ENDPOINT_API_KEY` | `openssl rand -hex 32` — must match backend `PUBLIC_ENDPOINT_API_KEY` if API auth is enforced |

### 5.2 Optional secrets

| Secret | When needed |
|--------|-------------|
| `GOOGLE_CLIENT_ID` | Google OAuth (marketing / app login) |
| `GOOGLE_CLIENT_SECRET` | Paired with client ID |
| `GHCR_PULL_TOKEN` | Private GHCR pulls on runner |

### 5.3 Remove (legacy)

`VPS_HOST`, `VPS_USER`, `VPS_SSH_KEY`, `VPS_SSH_PORT`

---

## 6. Repo settings checklist

| Check | All three repos |
|-------|-----------------|
| Environment `dev` exists | ✓ |
| Secrets match `infra/env/secrets.list` | ✓ |
| No `VPS_*` SSH secrets on deploy environment | ✓ |
| **Actions** enabled | ✓ |
| **Workflow permissions** → read repo contents; **Packages** write (for GHCR push in build jobs) | ✓ |
| Default deploy branch | `develop` |

---

## 7. First deploy order

After VPS §2–§5 of [01-deploy.md](01-deploy.md) and secrets above:

| Order | Repo | Workflow |
|-------|------|----------|
| 1 | `plys-internal-hub-service-api` | **Deploy Dev** (`deploy-dev.yml`) |
| 2 | `plys-internal-hub` | Deploy Dev per app (or `deploy-dev-all.yml`) |
| 3 | `plys-monorepo-webapps` | Deploy Dev per app (or `deploy-dev-all.yml`) |

Runner group: `plys-dev-runners` · Branch: `develop`

---

## 8. Verify secrets without deploying

On a machine with repo cloned and secrets exported locally:

```bash
cd plys-internal-hub-service-api
export DB_PASSWORD=... REDIS_PASSWORD=... JWT_ACCESS_SECRET=...  # etc.
node scripts/render-deploy-env.mjs --deploy-env dev --output /tmp/.env.dev
```

Repeat for `plys-internal-hub` and `plys-monorepo-webapps` with `AUTH_SECRET` (and webapps extras). Render must complete without `Missing required secrets`.

[← Deploy guide](01-deploy.md) · [Prod GitHub setup](../deploy-prod/02-github-monorepos.md)
