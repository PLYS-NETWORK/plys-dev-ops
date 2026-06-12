# GitHub setup — three monorepos (combined VPS)

**Track:** [deploy-all-in-one-vps](README.md) · One VPS runs **both** dev and prod stacks.

Configure **two** GitHub Environments on **each** of the three monorepos: `dev` and `production`. Use **separate** org runner groups and **separate** secret values per environment.

---

## 1. Organization runners (two groups)

| Group | VPS | Docs |
|-------|-----|------|
| `plys-dev-runners` | Dev stack on combined host (or dedicated dev VPS) | [Runner §4.3](../vps-started/02-self-hosted-runner.md#43-create-plys-dev-runners-github-ui) |
| `plys-prod-runners` | Prod stack on combined host (or dedicated prod VPS) | [Runner §4.4](../vps-started/02-self-hosted-runner.md#44-create-plys-prod-runners-github-ui) |

On a **true** combined single VPS you may register **two** org runners (dev + prod labels) or one runner with both labels — prefer **two groups, two machines** when possible.

**Workflow access lists:** [§4.7](../vps-started/02-self-hosted-runner.md#47-workflow-access--full-copy-paste-lists)

**Repositories (both groups):** `plys-internal-hub-service-api`, `plys-internal-hub`, `plys-monorepo-webapps`

---

## 2. Per-repo environments

| Repo | Environments to create | Detailed secret tables |
|------|----------------------|-------------------------|
| `plys-internal-hub-service-api` | `dev` + `production` | [Dev §3](../deploy-dev/02-github-monorepos.md#3-plys-internal-hub-service-api) · [Prod §3](../deploy-prod/02-github-monorepos.md#3-plys-internal-hub-service-api) |
| `plys-internal-hub` | `dev` + `production` | [Dev §4](../deploy-dev/02-github-monorepos.md#4-plys-internal-hub) · [Prod §4](../deploy-prod/02-github-monorepos.md#4-plys-internal-hub) |
| `plys-monorepo-webapps` | `dev` + `production` | [Dev §5](../deploy-dev/02-github-monorepos.md#5-plys-monorepo-webapps) · [Prod §5](../deploy-prod/02-github-monorepos.md#5-plys-monorepo-webapps) |

---

## 3. `/apps/.env.data` ↔ GitHub (combined host)

Combined VPS `/apps/.env.data` holds **both** dev and prod DB/Redis passwords:

| `/apps/.env.data` key | GitHub environment | Secret name |
|-----------------------|-------------------|-------------|
| `POSTGRES_DEV_PASSWORD` | `dev` (service-api repo) | `DB_PASSWORD` |
| `REDIS_DEV_PASSWORD` | `dev` (service-api repo) | `REDIS_PASSWORD` |
| `POSTGRES_PROD_PASSWORD` | `production` (service-api repo) | `DB_PASSWORD` |
| `REDIS_PROD_PASSWORD` | `production` (service-api repo) | `REDIS_PASSWORD` |

See [infra README](../vps-started/infra/README.md#github-secrets-mapping).

---

## 4. Rules for combined host

| Rule | Why |
|------|-----|
| Dev secrets only in environment `dev` | Prevents prod workflows reading dev keys |
| Prod secrets only in environment `production` | Isolation + approval gates |
| Never reuse `AUTH_SECRET` / JWT / API keys across environments | Security |
| Remove all `VPS_*` secrets from both environments | Org runners deploy locally |
| `GHCR_PULL_TOKEN` per environment if needed | Runner pulls images on same VPS |

---

## 5. Deploy order (combined)

**Dev** (`plys-dev-runners`):

1. `plys-internal-hub-service-api` → Deploy Dev  
2. `plys-internal-hub` → Deploy Dev  
3. `plys-monorepo-webapps` → Deploy Dev  

**Prod** (`plys-prod-runners`, manual + approval):

1. `plys-internal-hub-service-api` → Deploy Prod  
2. `plys-internal-hub` → Deploy Prod  
3. `plys-monorepo-webapps` → Deploy Prod  

Full VPS steps: [01-deploy.md](01-deploy.md) · [§5 GitHub Actions](01-deploy.md#5-github-actions-self-hosted-runners)

[← Deploy guide](01-deploy.md)
