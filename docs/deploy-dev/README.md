# Deploy — development VPS

Dedicated **dev-only** host. For prod or a combined dev+prod host, use the other tracks.

**Prerequisite:** complete [vps-started/01-prerequisites.md](../vps-started/01-prerequisites.md) first.

## Step-by-step

| Step | Section in [01-deploy.md](01-deploy.md) | What you do |
|------|----------------------------------------|-------------|
| **1** | §1 Clean VPS | Stop PM2/Docker, optional full wipe |
| **2** | §2 Postgres + Redis | Copy [dev compose templates](../vps-started/infra/README.md), start data layer |
| **3** | [02-github-monorepos.md](02-github-monorepos.md) | GitHub Environment `dev` — secrets for all three monorepos |
| **4** | §3 App directories | Create `/apps/.../dev/current` paths |
| **5** | §4 Nginx | Dev hostnames, TLS (certbot), reverse proxy |
| **6** | §5 GitHub Actions | Run deploy workflows on `plys-dev-runners` |
| **7** | §6 Verify | Health checks, smoke URLs |

## Optional

| Step | Guide |
|------|-------|
| Data GUI | [Adminer + Redis Insight](../vps-started/04-data-tools-adminer-redis.md) — `db-dev` / `redis-dev` |
| Manual deploy | [05-manual-deploy.md](../vps-started/05-manual-deploy.md) |
| Reset | [03-cleanup-and-reset.md](../vps-started/03-cleanup-and-reset.md) §4 or §6.1 |

## GitHub

- **Setup guide:** [02-github-monorepos.md](02-github-monorepos.md) — environments, secrets, runner group
- **Environment:** `dev` · **Branch:** `develop` · **Runner group:** `plys-dev-runners`

## Related tracks

| Track | Link |
|-------|------|
| Host setup | [vps-started](../vps-started/README.md) |
| Prod VPS | [deploy-prod](../deploy-prod/README.md) |
| Combined VPS | [deploy-all-in-one-vps](../deploy-all-in-one-vps/README.md) |

[← Back to docs index](../README.md)
