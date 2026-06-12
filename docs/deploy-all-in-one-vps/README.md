# Deploy — all-in-one VPS (dev + prod)

Single host running **both** dev and prod stacks (separate Postgres/Redis, ports, and nginx server blocks).

**Prerequisite:** complete [vps-started/01-prerequisites.md](../vps-started/01-prerequisites.md) first.

Prefer separate dev and prod machines when possible. Use dedicated guides instead:

- [deploy-dev/01-deploy.md](../deploy-dev/01-deploy.md) — dev-only VPS
- [deploy-prod/01-deploy.md](../deploy-prod/01-deploy.md) — prod-only VPS

## Step-by-step

| Step | Section in [01-deploy.md](01-deploy.md) | What you do |
|------|----------------------------------------|-------------|
| **1** | §1 Full clean VPS | Greenfield reset (destructive) |
| **2** | §1.5–1.6 Data layer | Combined [infra templates](../vps-started/infra/README.md) → `/apps` |
| **3** | §2 Cloudflare DNS | Point all dev + prod hostnames to this VPS |
| **4** | §3 Ports and routing | Port matrix for all services |
| **5** | §4 VPS setup | Nginx, TLS, deploy order for both environments |
| **6** | [02-github-monorepos.md](02-github-monorepos.md) | GitHub `dev` + `production` environments on all three repos |
| **7** | §5 Self-hosted runners | Dev + prod runner groups |
| **8** | §6 Post-deploy verification | End-to-end checks |

## Optional

| Step | Guide |
|------|-------|
| Data GUI | [Adminer + Redis Insight](../vps-started/04-data-tools-adminer-redis.md) |
| Runner details | [02-self-hosted-runner.md](../vps-started/02-self-hosted-runner.md) |
| Reset | [03-cleanup-and-reset.md](../vps-started/03-cleanup-and-reset.md) |
| Manual deploy | [05-manual-deploy.md](../vps-started/05-manual-deploy.md) |

## When to use this track

- Cost-constrained single VPS
- Staging host that mirrors prod topology
- Initial bootstrap before splitting into dedicated dev/prod hosts

## Related tracks

| Track | Link |
|-------|------|
| Host setup | [vps-started](../vps-started/README.md) |
| Dev-only | [deploy-dev](../deploy-dev/README.md) |
| Prod-only | [deploy-prod](../deploy-prod/README.md) |

[← Back to docs index](../README.md)
