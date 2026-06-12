# Deploy — production VPS

Dedicated **prod-only** host. For dev or a combined dev+prod host, use the other tracks.

**Prerequisite:** complete [vps-started/01-prerequisites.md](../vps-started/01-prerequisites.md) first.

## Step-by-step

| Step | Section in [01-deploy.md](01-deploy.md) | What you do |
|------|----------------------------------------|-------------|
| **1** | §1 Clean VPS | Stop PM2/Docker; **back up** before any destructive step |
| **2** | §2 Postgres + Redis | Copy [prod compose templates](../vps-started/infra/README.md), start data layer |
| **3** | [02-github-monorepos.md](02-github-monorepos.md) | GitHub Environment `production` — secrets, reviewers |
| **4** | §3 App directories | Create `/apps/.../prod/current` paths |
| **5** | §4 Nginx | Prod hostnames, TLS (certbot), reverse proxy |
| **6** | §5 GitHub Actions | Run deploy workflows on `plys-prod-runners` |
| **7** | §6 Verify | Health checks, smoke URLs |

## Optional

| Step | Guide |
|------|-------|
| Data GUI | [Adminer + Redis Insight](../vps-started/04-data-tools-adminer-redis.md) — prefer SSH tunnel on prod |
| Manual deploy | [05-manual-deploy.md](../vps-started/05-manual-deploy.md) |
| Reset | [03-cleanup-and-reset.md](../vps-started/03-cleanup-and-reset.md) §5 or §6.2 — **backup first** |

## GitHub

- **Setup guide:** [02-github-monorepos.md](02-github-monorepos.md) — environments, secrets, protection rules
- **Environment:** `production` (with protection rules) · **Branch:** `main` · **Runner group:** `plys-prod-runners`

## Related tracks

| Track | Link |
|-------|------|
| Host setup | [vps-started](../vps-started/README.md) |
| Dev VPS | [deploy-dev](../deploy-dev/README.md) |
| Combined VPS | [deploy-all-in-one-vps](../deploy-all-in-one-vps/README.md) |

[← Back to docs index](../README.md)
