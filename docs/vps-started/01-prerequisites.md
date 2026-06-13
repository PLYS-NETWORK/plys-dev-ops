# VPS setup — packages and tooling (before deploy)

**Track:** [vps-started](README.md) · Step **1** of 5 · [Docs index](../README.md)

Run this guide **once per VPS** before Postgres/Redis, nginx, or application deploys. It installs Node.js, Docker, nginx, and the other host tools the Plys platform expects.

Related:

- Dev deploy: [Dev deploy](../deploy-dev/01-deploy.md)
- Prod deploy: [Prod deploy](../deploy-prod/01-deploy.md)
- Combined VPS: [All-in-one deploy](../deploy-all-in-one-vps/01-deploy.md)
- Manual deploy: [Manual deploy](05-manual-deploy.md)
- Self-hosted runner: [Self-hosted runner](02-self-hosted-runner.md)
- Data layer templates: [Infra templates](infra/README.md)

---

## 1. Assumptions


| Item         | Value                             |
| ------------ | --------------------------------- |
| OS           | Ubuntu 22.04 / 24.04 or Debian 12 |
| Shell        | `bash`                            |
| Deploy root  | `/apps`                           |
| Node version | 22 LTS (via `nvm`)                |
| Access       | SSH as a sudo-capable deploy user |


Use a **dedicated dev VPS** and a **dedicated prod VPS**. Do not mix environments on one host unless you follow the combined guide.

---

## 2. System packages

`docker-compose-plugin` is **not** in default Ubuntu/Debian repos. Install Docker from Docker’s official apt repository so `docker compose` (v2) is available.

### 2.1 Base packages (apt)

**On VPS:**

```bash
sudo apt update
sudo apt install -y \
  ca-certificates \
  curl \
  git \
  gnupg \
  tar \
  unzip \
  nginx \
  certbot \
  python3-certbot-nginx \
  redis-tools \
  postgresql-client \
  apache2-utils
```


| Package              | Purpose                                                  |
| -------------------- | -------------------------------------------------------- |
| `nginx`, `certbot`   | Reverse proxy and TLS                                    |
| `redis-tools`        | `redis-cli` health checks                                |
| `postgresql-client`  | `psql` health checks                                     |
| `apache2-utils`      | `htpasswd` for optional Adminer/Redis Insight nginx auth |
| `git`, `curl`, `tar` | Source checkout and self-hosted runner install           |


### 2.2 Docker + Compose plugin (official repo)

**On VPS:**

```bash
# Remove distro docker packages if a previous install failed or mixed packages exist
sudo apt remove -y docker.io docker-doc docker-compose docker-compose-v2 podman-docker containerd runc 2>/dev/null || true

. /etc/os-release
DOCKER_DIST="${ID}"
if [ "$DOCKER_DIST" != "ubuntu" ] && [ "$DOCKER_DIST" != "debian" ]; then
  echo "Unsupported distro: $DOCKER_DIST (expected ubuntu or debian)"
  exit 1
fi

sudo install -m 0755 -d /etc/apt/keyrings
sudo rm -f /etc/apt/keyrings/docker.gpg
curl -fsSL "https://download.docker.com/linux/${DOCKER_DIST}/gpg" | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
sudo chmod a+r /etc/apt/keyrings/docker.gpg

echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] \
https://download.docker.com/linux/${DOCKER_DIST} ${VERSION_CODENAME} stable" \
| sudo tee /etc/apt/sources.list.d/docker.list > /dev/null

sudo apt update
sudo apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

docker --version
docker compose version
```


| Package                      | Purpose                                       |
| ---------------------------- | --------------------------------------------- |
| `docker-ce`, `docker-ce-cli` | Docker engine and CLI                         |
| `docker-compose-plugin`      | `docker compose` v2 (required by deploy docs) |
| `containerd.io`              | Container runtime                             |


Enable Docker on boot and add the deploy user to the `docker` group:

```bash
sudo systemctl enable docker
sudo systemctl start docker
sudo usermod -aG docker "$USER"
```

Log out and SSH back in so the `docker` group applies.

### 2.3 Nginx proxy buffer sizes

Next.js and auth-heavy apps can return large `Set-Cookie` response headers. Without larger proxy buffers, nginx logs **`upstream sent too big header while reading response header from upstream`** and returns **502** to clients.

**On VPS** — install once (template: [infra/nginx/proxy-buffers.conf](infra/nginx/proxy-buffers.conf)):

```bash
sudo tee /etc/nginx/conf.d/proxy-buffers.conf > /dev/null <<'NGINX'
# Upstream apps (Next.js, auth cookies) may exceed default 4k/8k header buffers
proxy_buffer_size 128k;
proxy_buffers 4 256k;
proxy_busy_buffers_size 256k;
NGINX

sudo nginx -t && sudo systemctl reload nginx
```

Already deployed? Re-run the block above on the VPS, then retry the failing URL (e.g. `https://app-dev.ployos.com/en/dashboard`).

---

## 3. Node.js toolchain (nvm → Node 22 → pnpm → PM2)

Run as the **deploy user** (not `root`). Install in this order.

### 3.1 Install nvm

**On VPS:**

```bash
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash

export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"

nvm --version
```

Load nvm automatically on login:

```bash
grep -q 'NVM_DIR' ~/.bashrc || cat >> ~/.bashrc <<'EOF'

export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"
EOF
```

Open a new SSH session, or run `source ~/.bashrc`, before continuing.

### 3.2 Install Node 22

**On VPS:**

```bash
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"

nvm install 22
nvm alias default 22
nvm use 22

node -v    # expect v22.x
npm -v
which node # should be under ~/.nvm
```

### 3.3 Install pnpm

**On VPS:**

```bash
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"
nvm use 22

corepack enable
corepack prepare pnpm@latest --activate

pnpm -v
which pnpm
```

If `corepack` is unavailable, use npm instead:

```bash
npm install -g pnpm
pnpm -v
```

### 3.4 Install PM2

PM2 manages Node app processes on the VPS.

**On VPS:**

```bash
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"
nvm use 22

npm install -g pm2
pm2 -v
which pm2
```

### 3.5 Self-hosted runner user (optional)

Skip this section if you deploy **manually** from your own SSH user only.

GitHub Actions deploy workflows run as a dedicated Linux user (`github-runner`). That user needs its **own** nvm/Node 22/pnpm/PM2 install and access to Docker — separate from your deploy admin account.


| Account                       | Used for                                               |
| ----------------------------- | ------------------------------------------------------ |
| Your SSH user (e.g. `ubuntu`) | Manual deploy, nginx, certbot, initial VPS setup       |
| `github-runner`               | GitHub Actions jobs on the VPS (`runs-on: plys-*-vps`) |


#### 3.5.1 Create user and Docker access

**On VPS** (as your sudo deploy user):

```bash
sudo useradd --create-home --shell /bin/bash github-runner 2>/dev/null || true
sudo usermod -aG docker github-runner

id github-runner
groups github-runner   # must include docker
```

The `docker` group change applies on the runner’s **next login**. Restart the runner service after registration if Docker permission errors appear.

#### 3.5.2 Install nvm, Node 22, pnpm, and PM2

**On VPS** — switch to `github-runner` and run the full toolchain install:

```bash
sudo -iu github-runner
```

Inside the `github-runner` shell:

```bash
# --- nvm (Section 3.1) ---
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash

export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"

grep -q 'NVM_DIR' ~/.bashrc || cat >> ~/.bashrc <<'EOF'

export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"
EOF

nvm --version

# --- Node 22 (Section 3.2) ---
nvm install 22
nvm alias default 22
nvm use 22

node -v    # expect v22.x
npm -v

# --- pnpm (Section 3.3) ---
corepack enable
corepack prepare pnpm@latest --activate
# fallback: npm install -g pnpm

pnpm -v

# --- PM2 (Section 3.4) — use npm for global CLIs ---
npm install -g pm2
pm2 -v

which node pm2 pnpm
```

Exit back to your admin user when done:

```bash
exit
```

#### 3.5.3 Verify runner user toolchain

**On VPS** (as admin):

```bash
sudo -u github-runner bash -lc 'node -v && pnpm -v && pm2 -v && docker ps'
```

Expected:

- `node -v` → `v22.x`
- `docker ps` works without `sudo` (no permission denied)

If `docker ps` fails for `github-runner`, run `groups github-runner` and confirm `docker` is listed, then restart the runner service after registration.

#### 3.5.4 Create deploy directories and grant runner access

Create `/apps` app trees **first**, then assign ownership to `github-runner`. Directories must exist before `chown` succeeds.

**Dev-only VPS:**

```bash
sudo mkdir -p /apps
sudo mkdir -p /apps/source
sudo mkdir -p /apps/plys-webapps/dev/{current,logs}
sudo mkdir -p /apps/internal-hub-fe/dev/{current,logs}
sudo mkdir -p /apps/internal-hub-be/dev/{current,logs}
sudo mkdir -p /apps/monitoring/{current,data}

sudo chown -R github-runner:github-runner \
  /apps/source /apps/plys-webapps /apps/internal-hub-fe /apps/internal-hub-be /apps/monitoring
```

**Prod-only VPS:**

```bash
sudo mkdir -p /apps
sudo mkdir -p /apps/source
sudo mkdir -p /apps/plys-webapps/prod/{current,logs}
sudo mkdir -p /apps/internal-hub-fe/prod/{current,logs}
sudo mkdir -p /apps/internal-hub-be/prod/{current,logs}
sudo mkdir -p /apps/monitoring/{current,data}

sudo chown -R github-runner:github-runner \
  /apps/source /apps/plys-webapps /apps/internal-hub-fe /apps/internal-hub-be /apps/monitoring
```

**Combined VPS:**

```bash
sudo mkdir -p /apps
sudo mkdir -p /apps/source
sudo mkdir -p /apps/plys-webapps/{dev,prod}/{current,logs}
sudo mkdir -p /apps/internal-hub-fe/{dev,prod}/{current,logs}
sudo mkdir -p /apps/internal-hub-be/{dev,prod}/{current,logs}
sudo mkdir -p /apps/monitoring/{current,data}

sudo chown -R github-runner:github-runner \
  /apps/source /apps/plys-webapps /apps/internal-hub-fe /apps/internal-hub-be /apps/monitoring
```

Do **not** give `github-runner` ownership of `/etc/nginx` or TLS certs. nginx stays managed by your admin user.

If you also deploy manually from your SSH user, run Section 4 afterward to align ownership, or add your user to the same paths with `sudo chown -R "$USER:$USER" ...` only where the admin user must write (nginx stays separate).

#### 3.5.5 Register the runner in GitHub

Toolchain and permissions are ready. Complete runner registration and systemd setup:

→ [Self-hosted runner](02-self-hosted-runner.md) — Sections 4–6 (runner groups, register, systemd)

Use the environment label that matches this VPS:


| VPS  | Runner label    |
| ---- | --------------- |
| Dev  | `plys-dev-vps`  |
| Prod | `plys-prod-vps` |


---

## 4. Create `/apps` layout

Canonical app paths on every VPS:

| Path | Repo |
|------|------|
| `/apps/plys-webapps/{dev,prod}/current` | plys-monorepo-webapps |
| `/apps/internal-hub-fe/{dev,prod}/current` | plys-internal-hub |
| `/apps/internal-hub-be/{dev,prod}/current` | plys-internal-hub-serivce-api |
| `/apps/monitoring/current` | plys-dev-ops (OpenObserve) |

**Self-hosted runner:** if you completed Section 3.5.4, directories already exist and are owned by `github-runner` — verify with `ls -la /apps/plys-webapps` and skip the mkdir blocks below unless you deploy manually from your SSH user.

**Manual deploy only (no Section 3.5):** run the matching block below as your deploy user.

### Dev-only VPS

```bash
sudo mkdir -p /apps
sudo chown "$USER:$USER" /apps

mkdir -p /apps/source
mkdir -p /apps/plys-webapps/dev/{current,logs}
mkdir -p /apps/internal-hub-fe/dev/{current,logs}
mkdir -p /apps/internal-hub-be/dev/{current,logs}
mkdir -p /apps/monitoring/{current,data}
chmod 700 /apps/monitoring/data
```

### Prod-only VPS

```bash
sudo mkdir -p /apps
sudo chown "$USER:$USER" /apps

mkdir -p /apps/source
mkdir -p /apps/plys-webapps/prod/{current,logs}
mkdir -p /apps/internal-hub-fe/prod/{current,logs}
mkdir -p /apps/internal-hub-be/prod/{current,logs}
mkdir -p /apps/monitoring/{current,data}
chmod 700 /apps/monitoring/data
```

### Combined VPS (dev + prod)

```bash
sudo mkdir -p /apps
sudo chown "$USER:$USER" /apps

mkdir -p /apps/source
mkdir -p /apps/plys-webapps/{dev,prod}/{current,logs}
mkdir -p /apps/internal-hub-fe/{dev,prod}/{current,logs}
mkdir -p /apps/internal-hub-be/{dev,prod}/{current,logs}
mkdir -p /apps/monitoring/{current,data}
chmod 700 /apps/monitoring/data
```

---

## 5. Optional — GHCR login

Required only when the VPS must pull private images from GitHub Container Registry and `GITHUB_TOKEN` from CI is not enough.

**On VPS:**

```bash
echo "$GHCR_PULL_TOKEN" | docker login ghcr.io -u YOUR_GITHUB_USER --password-stdin
```

---

## 6. Verify host readiness

**On VPS:**

```bash
# Versions
docker --version
docker compose version
nginx -v
node -v
pnpm -v
pm2 -v

# Docker works for deploy user
docker ps
docker compose version

# nginx is running
sudo nginx -t
sudo systemctl is-active nginx

# Redis/Postgres clients available
redis-cli --version
psql --version

# App directories exist
find /apps -maxdepth 3 -type d | sort

# If using self-hosted runner (Section 3.5)
sudo -iu github-runner -c 'bash -lc "node -v && pnpm -v && pm2 -v && docker ps"' 2>/dev/null || true
```

Expected:

- Docker and Docker Compose respond without `permission denied`
- Node reports `v22.x`
- `/apps/.../current` and `/apps/.../logs` directories exist for the target environment
- `github-runner` can run `node`, `pnpm`, `pm2`, and `docker ps` (if Section 3.5 completed)

---

## 7. What to do next

After this guide, continue in order:


| Step | Guide                                                                                              | Section                             |
| ---- | -------------------------------------------------------------------------------------------------- | ----------------------------------- |
| 1    | [Dev deploy](../deploy-dev/01-deploy.md) or [Prod deploy](../deploy-prod/01-deploy.md) | Postgres + Redis                    |
| 2    | Same guide                                                                                         | nginx + TLS                         |
| 3    | [Self-hosted runner](02-self-hosted-runner.md)                                             | Register runner (after Section 3.5) |
| 4    | App repo workflows or [Manual deploy](05-manual-deploy.md)                         | Deploy applications                 |


For a full greenfield combined host, use [All-in-one deploy](../deploy-all-in-one-vps/01-deploy.md) after completing this setup.

---

## 8. Troubleshooting


| Symptom                                          | Fix                                                                                  |
| ------------------------------------------------ | ------------------------------------------------------------------------------------ |
| `Unable to locate package docker-compose-plugin` | Do not install `docker.io` from default apt — use Section 2.2 (Docker official repo) |
| `docker: permission denied`                      | `sudo usermod -aG docker "$USER"` then re-login                                      |
| `node: command not found` in new shell           | Ensure nvm block is in `~/.bashrc`, then `source ~/.bashrc`                          |
| `pm2: command not found`                         | Re-run Section 3.4 under Node 22 (`nvm use 22`)                                      |
| `pnpm: command not found`                        | Re-run Section 3.3 under Node 22 (`nvm use 22`)                                      |
| `nvm: command not found` in new shell            | Run `source ~/.bashrc` or re-login after Section 3.1                                 |
| nginx fails `nginx -t`                           | Remove broken symlinks in `/etc/nginx/sites-enabled/` before first deploy            |
| `upstream sent too big header` (502 on app URLs) | Install [§2.3 proxy buffers](01-prerequisites.md#23-nginx-proxy-buffer-sizes); reload nginx |
| `connect() failed (111: Connection refused)`     | Upstream app not listening (check PM2/Docker on the mapped port, e.g. `:3021`)       |
| Old Node from apt conflicts with nvm             | Use `which node` — prefer nvm path under `~/.nvm`                                    |
| `github-runner` cannot run `docker`              | `sudo usermod -aG docker github-runner`, then restart runner service                 |
| CI job cannot find `node`/`pnpm`/`pm2`           | Install toolchain under `github-runner` (Section 3.5.2), not only admin user         |
| CI job permission denied on `/apps/...`          | Re-run Section 3.5.4 (mkdir deploy dirs, then `chown` to `github-runner`)          |


