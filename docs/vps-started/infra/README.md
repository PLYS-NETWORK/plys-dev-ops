# VPS infra templates (`/apps` data layer)

Copy these files to the VPS with `sudo nano` (paste contents from this folder). No git required on the server.

| File | Copy to on VPS | Use on |
|------|----------------|--------|
| [docker-compose.data.yml](docker-compose.data.yml) | `/apps/docker-compose.yml` | Single VPS (dev + prod DB/Redis) |
| [docker-compose.data-dev.yml](docker-compose.data-dev.yml) | `/apps/docker-compose.yml` | Dev-only VPS |
| [docker-compose.data-prod.yml](docker-compose.data-prod.yml) | `/apps/docker-compose.yml` | Prod-only VPS |
| [env.data.example](env.data.example) | `/apps/.env.data` | Combined VPS (fill passwords) |
| [env.data.dev.example](env.data.dev.example) | `/apps/.env.data` | Dev-only VPS |
| [env.data.prod.example](env.data.prod.example) | `/apps/.env.data` | Prod-only VPS |
| [nginx/proxy-buffers.conf](nginx/proxy-buffers.conf) | `/etc/nginx/conf.d/proxy-buffers.conf` | All VPS (fixes large upstream response headers) |

**Data GUI (optional):** compose templates include **Adminer** (`127.0.0.1:8080`) and **Redis Insight** (`127.0.0.1:5540`). Setup: [Adminer + Redis Insight](../04-data-tools-adminer-redis.md).

## Quick setup (dev VPS)

```bash
sudo nano /apps/docker-compose.yml
# paste docker-compose.data-dev.yml

export POSTGRES_DEV_PASSWORD="$(openssl rand -hex 24)"
export REDIS_DEV_PASSWORD="$(openssl rand -hex 24)"

sudo tee /apps/.env.data > /dev/null <<EOF
POSTGRES_DEV_PASSWORD=${POSTGRES_DEV_PASSWORD}
REDIS_DEV_PASSWORD=${REDIS_DEV_PASSWORD}
EOF
sudo chown "$USER:$USER" /apps/.env.data
chmod 600 /apps/.env.data

cd /apps
docker compose --env-file /apps/.env.data up -d postgres-dev redis-dev adminer redisinsight
```

See [Dev deploy](../../deploy-dev/01-deploy.md), [Adminer + Redis Insight](../04-data-tools-adminer-redis.md), and [Cleanup and reset](../03-cleanup-and-reset.md).

## GitHub secrets mapping

| `/apps/.env.data` key | GitHub Environment | Secret name |
|-----------------------|-------------------|-------------|
| `POSTGRES_DEV_PASSWORD` | `dev` | `DB_PASSWORD` |
| `REDIS_DEV_PASSWORD` | `dev` | `REDIS_PASSWORD` |
| `POSTGRES_PROD_PASSWORD` | `production` | `DB_PASSWORD` |
| `REDIS_PROD_PASSWORD` | `production` | `REDIS_PASSWORD` |
