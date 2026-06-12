# VPS started — host setup (all tracks)

Run these guides **before** any application deploy. They apply to dev-only, prod-only, and combined VPS hosts.

## Step-by-step

| Step | Guide | What you do |
|------|-------|-------------|
| **1** | [01-prerequisites.md](01-prerequisites.md) | apt packages, Docker, nvm → Node 22 → pnpm → PM2; §4 `/apps` layout; §3.5.4 mkdir + runner `chown` |
| **2** | [Infra templates](infra/README.md) | Copy `docker-compose` + `.env.data` templates to `/apps` (done again in deploy guides) |
| **3** | [02-self-hosted-runner.md](02-self-hosted-runner.md) | Org runner groups (dev/prod), register runner, systemd service |
| **4** | Pick a deploy track | [Dev](../deploy-dev/01-deploy.md) · [Prod](../deploy-prod/01-deploy.md) · [All-in-one](../deploy-all-in-one-vps/01-deploy.md) |
| **5** | [05-manual-deploy.md](05-manual-deploy.md) | *(optional)* Deploy from VPS shell without GitHub Actions |

## Maintenance

| Guide | When |
|-------|------|
| [03-cleanup-and-reset.md](03-cleanup-and-reset.md) | Tear down apps, reset Postgres/Redis volumes, start over |
| [04-data-tools-adminer-redis.md](04-data-tools-adminer-redis.md) | Expose Adminer / Redis Insight via nginx or SSH tunnel |

## Prerequisites checklist

- [ ] Ubuntu 22.04/24.04 or Debian 12, sudo SSH user
- [ ] Sections 1–4 of [01-prerequisites.md](01-prerequisites.md) complete
- [ ] `/apps/plys-webapps`, `/apps/internal-hub-fe`, `/apps/internal-hub-be` exist with correct ownership
- [ ] `docker compose version` works
- [ ] `node -v` shows v22.x, `pnpm -v` and `pm2 -v` work
- [ ] Section 3.5 runner user done if using CI deploys

## Next

- **Dev VPS** → [deploy-dev/01-deploy.md](../deploy-dev/01-deploy.md)
- **Prod VPS** → [deploy-prod/01-deploy.md](../deploy-prod/01-deploy.md)
- **Combined VPS** → [deploy-all-in-one-vps/01-deploy.md](../deploy-all-in-one-vps/01-deploy.md)

[← Back to docs index](../README.md)
