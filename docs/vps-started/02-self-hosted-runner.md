# VPS self-hosted GitHub Actions runner

**Track:** [vps-started](README.md) · Step **3** of 5 · [Docs index](../README.md)

Use this guide to install GitHub Actions self-hosted runners on the dev and prod VPS hosts. Deploy jobs then run directly on the target VPS instead of using a GitHub-hosted runner that SSH/SCPs into the server.

Related:

- [Prerequisites](01-prerequisites.md)
- [Dev deploy](../deploy-dev/01-deploy.md)
- [Prod deploy](../deploy-prod/01-deploy.md)
- [All-in-one deploy](../deploy-all-in-one-vps/01-deploy.md)

---

## 1. Runner model

| Environment | VPS | Runner group | Runner labels | GitHub environment |
|-------------|-----|--------------|---------------|--------------------|
| Dev | Dev VPS | `plys-dev-runners` | `self-hosted`, `linux`, `x64`, `plys-dev-vps` | `dev` |
| Prod | Prod VPS | `plys-prod-runners` | `self-hosted`, `linux`, `x64`, `plys-prod-vps` | `production` |

Keep dev and prod runners in **separate runner groups** on separate VPS hosts. Do not register one runner that can deploy to both environments.

Recommended workflow targeting (organization runners — see Section 4):

```yaml
runs-on:
  group: plys-dev-runners
  labels: [self-hosted, linux, x64, plys-dev-vps]
environment: dev
```

```yaml
runs-on:
  group: plys-prod-runners
  labels: [self-hosted, linux, x64, plys-prod-vps]
environment: production
```

Label-only targeting still works if you skip runner groups (repository runners):

```yaml
runs-on: [self-hosted, linux, x64, plys-dev-vps]
environment: dev
```

Keep production environment approval rules and any `confirm == 'deploy'` guard.

---

## 2. Why use this

Self-hosted runners optimize deployment because the job already runs on the VPS:

- No SSH private key is needed inside GitHub Actions.
- No SCP upload step is needed.
- Deployment scripts can write directly to `/apps/.../current`.
- Health checks can use `127.0.0.1`.
- Docker, PM2, nginx, and local env files are available on the target host.

Do not use self-hosted runners for untrusted pull request jobs. Restrict them to deploy workflows on trusted branches.

---

## 3. VPS prerequisites

Install host packages, Node 22 (nvm), pnpm, and PM2 first: [Prerequisites](01-prerequisites.md).

Create a dedicated runner user:

```bash
sudo useradd --create-home --shell /bin/bash github-runner 2>/dev/null || true
sudo usermod -aG docker github-runner
```

Create deploy directories and grant `github-runner` access — full commands in [Prerequisites §3.5.4](01-prerequisites.md#354-create-deploy-directories-and-grant-runner-access) (mkdir first, then `chown`).

**On VPS** — verify:

```bash
ls -la /apps/plys-webapps /apps/internal-hub-fe /apps/internal-hub-be
```

Log out and back in, or restart the runner service after adding `github-runner` to the `docker` group.

---

## 4. Organization runner groups (dev + prod)

Use **organization-level** runners when the three app monorepos and `plys-dev-ops` share the same dev and prod VPS hosts. Runner groups control **which repositories and workflows** may use each environment’s runners.

Organization slug: **`PLYS-NETWORK`** (use exact casing in workflow access fields).

### 4.1 Plan and permissions

| Requirement | Notes |
|-------------|-------|
| GitHub **Team** (or Enterprise) | Additional org runner groups beyond the built-in **Default** group require Team or Enterprise. See [Managing access using groups](https://docs.github.com/en/actions/hosting-your-own-runners/managing-self-hosted-runners/managing-access-to-self-hosted-runners-using-groups). |
| Org permission | **Organization owner**, or a custom role with **Manage organization runners and runner groups**. |
| Private repos only | Use self-hosted runners only with **private** repositories. Do not run untrusted PR/fork workflows on these runners. |

### 4.2 Groups to create

Create **two** groups — one per VPS environment. Never put dev and prod runners in the same group.

| Runner group | VPS | Runners in group | Purpose |
|--------------|-----|------------------|---------|
| `plys-dev-runners` | Dev VPS | `plys-dev-vps-1`, … | Dev deploy jobs only |
| `plys-prod-runners` | Prod VPS | `plys-prod-vps-1`, … | Prod deploy jobs only |

### 4.3 Create `plys-dev-runners` (GitHub UI)

**On GitHub** — organization `PLYS-NETWORK`:

1. Open **Settings** → **Actions** → **Runner groups**.
2. Click **New runner group**.
3. **Group name:** `plys-dev-runners`
4. **Repository access:** **Selected repositories** → add only:
   - `plys-internal-hub-service-api`
   - `plys-internal-hub`
   - `plys-monorepo-webapps`
   - `plys-dev-ops`
5. **Workflow access** (if shown on your plan): **Selected workflows** → allow only dev deploy workflows, for example:
   - `PLYS-NETWORK/plys-internal-hub-service-api/.github/workflows/deploy-dev.yml@refs/heads/develop`
   - `PLYS-NETWORK/plys-internal-hub/.github/workflows/deploy-dev-internal-hub.yml@refs/heads/develop`
   - `PLYS-NETWORK/plys-internal-hub/.github/workflows/deploy-dev-internal-admin-hub.yml@refs/heads/develop`
   - `PLYS-NETWORK/plys-internal-hub/.github/workflows/deploy-dev-internal-task-reviewer.yml@refs/heads/develop`
   - `PLYS-NETWORK/plys-monorepo-webapps/.github/workflows/deploy-dev-lonaos-app.yml@refs/heads/develop`
   - `PLYS-NETWORK/plys-monorepo-webapps/.github/workflows/deploy-dev-ployos-app.yml@refs/heads/develop`
   - `PLYS-NETWORK/plys-monorepo-webapps/.github/workflows/deploy-dev-lonaos-marketing.yml@refs/heads/develop`
   - `PLYS-NETWORK/plys-monorepo-webapps/.github/workflows/deploy-dev-ployos-marketing.yml@refs/heads/develop`
   - `PLYS-NETWORK/plys-dev-ops/.github/workflows/deploy-dev.yml@refs/heads/develop`

   Pin **all** dev deploy workflows (app monorepos + `plys-dev-ops` monitoring) to `refs/heads/develop` (or your dev branch). Do **not** add `main` workflows to `plys-dev-runners`. Use fully qualified refs (`refs/heads/...`) per GitHub docs.

   If workflow access is not available on your plan, rely on **repository access** + `environment: dev` + label `plys-dev-vps` instead.

6. Click **Create group**.

### 4.4 Create `plys-prod-runners` (GitHub UI)

Repeat Section 4.3 with:

| Setting | Value |
|---------|-------|
| **Group name** | `plys-prod-runners` |
| **Repository access** | Same four repos (selected list), including `plys-dev-ops` |
| **Workflow access** | Prod deploy workflows on `refs/heads/main`, for example: |
| | `PLYS-NETWORK/plys-internal-hub-service-api/.github/workflows/deploy-prod.yml@refs/heads/main` |
| | `PLYS-NETWORK/plys-internal-hub/.github/workflows/deploy-prod-internal-hub.yml@refs/heads/main` |
| | `PLYS-NETWORK/plys-internal-hub/.github/workflows/deploy-prod-internal-admin-hub.yml@refs/heads/main` |
| | `PLYS-NETWORK/plys-internal-hub/.github/workflows/deploy-prod-internal-task-reviewer.yml@refs/heads/main` |
| | `PLYS-NETWORK/plys-monorepo-webapps/.github/workflows/deploy-prod-lonaos-app.yml@refs/heads/main` |
| | `PLYS-NETWORK/plys-monorepo-webapps/.github/workflows/deploy-prod-ployos-app.yml@refs/heads/main` |
| | `PLYS-NETWORK/plys-monorepo-webapps/.github/workflows/deploy-prod-lonaos-marketing.yml@refs/heads/main` |
| | `PLYS-NETWORK/plys-monorepo-webapps/.github/workflows/deploy-prod-ployos-marketing.yml@refs/heads/main` |
| | `PLYS-NETWORK/plys-dev-ops/.github/workflows/deploy-prod.yml@refs/heads/main` |

Keep **production** environment protection rules (required reviewers) on all prod workflows regardless of runner group settings.

### 4.5 Verify group policies

After both groups exist:

| Check | Dev (`plys-dev-runners`) | Prod (`plys-prod-runners`) |
|-------|--------------------------|----------------------------|
| Repositories | Four repos: three app monorepos + `plys-dev-ops` | Same four repos |
| Workflows | All dev deploy workflows on `develop` (apps + `plys-dev-ops` monitoring) | App + monitoring prod workflows on `main` |
| Runners | Dev VPS machine(s) only | Prod VPS machine(s) only |
| Cross-use | Prod workflows must **not** match dev group | Dev workflows must **not** match prod group |

To change access later: **Settings** → **Actions** → **Runner groups** → select group → edit **Repository access** / **Workflow access**.

To move an already-registered runner: **Settings** → **Actions** → **Runners** → select runner → **Move runner to group**.

### 4.6 Get registration token

**On GitHub:**

1. Organization → **Settings** → **Actions** → **Runners**.
2. Click **New runner**.
3. Copy the **registration token** and Linux x64 download URL (used in Section 5).

The token is short-lived. Generate a new one if registration fails with an expired token error.

### 4.7 Workflow access — full copy-paste lists

GitHub repo name is **`plys-internal-hub-service-api`** (not `plys-internal-hub-serivce-api`). Paste into **Workflow access** when configuring each runner group.

**`plys-dev-runners`** (22 workflows — all on `refs/heads/develop`, including `plys-dev-ops` monitoring):

```
PLYS-NETWORK/plys-internal-hub-service-api/.github/workflows/deploy-dev.yml@refs/heads/develop, PLYS-NETWORK/plys-internal-hub-service-api/.github/workflows/deploy-dev.api-gateway.yml@refs/heads/develop, PLYS-NETWORK/plys-internal-hub-service-api/.github/workflows/deploy-dev.identity-service.yml@refs/heads/develop, PLYS-NETWORK/plys-internal-hub-service-api/.github/workflows/deploy-dev.business-service.yml@refs/heads/develop, PLYS-NETWORK/plys-internal-hub-service-api/.github/workflows/deploy-dev.consultant-service.yml@refs/heads/develop, PLYS-NETWORK/plys-internal-hub-service-api/.github/workflows/deploy-dev.internal-admin-service.yml@refs/heads/develop, PLYS-NETWORK/plys-internal-hub-service-api/.github/workflows/deploy-dev.internal-task-reviewer-service.yml@refs/heads/develop, PLYS-NETWORK/plys-internal-hub-service-api/.github/workflows/deploy-dev.finance-service.yml@refs/heads/develop, PLYS-NETWORK/plys-internal-hub-service-api/.github/workflows/deploy-dev.notifications-service.yml@refs/heads/develop, PLYS-NETWORK/plys-internal-hub-service-api/.github/workflows/deploy-dev.platform-service.yml@refs/heads/develop, PLYS-NETWORK/plys-internal-hub-service-api/.github/workflows/deploy-dev.ai-agents-service.yml@refs/heads/develop, PLYS-NETWORK/plys-internal-hub-service-api/.github/workflows/deploy-dev.ai-model-service.yml@refs/heads/develop, PLYS-NETWORK/plys-internal-hub/.github/workflows/deploy-dev-internal-hub.yml@refs/heads/develop, PLYS-NETWORK/plys-internal-hub/.github/workflows/deploy-dev-internal-admin-hub.yml@refs/heads/develop, PLYS-NETWORK/plys-internal-hub/.github/workflows/deploy-dev-internal-task-reviewer.yml@refs/heads/develop, PLYS-NETWORK/plys-internal-hub/.github/workflows/deploy-dev-all.yml@refs/heads/develop, PLYS-NETWORK/plys-monorepo-webapps/.github/workflows/deploy-dev-ployos-app.yml@refs/heads/develop, PLYS-NETWORK/plys-monorepo-webapps/.github/workflows/deploy-dev-lonaos-app.yml@refs/heads/develop, PLYS-NETWORK/plys-monorepo-webapps/.github/workflows/deploy-dev-ployos-marketing.yml@refs/heads/develop, PLYS-NETWORK/plys-monorepo-webapps/.github/workflows/deploy-dev-lonaos-marketing.yml@refs/heads/develop, PLYS-NETWORK/plys-monorepo-webapps/.github/workflows/deploy-dev-all.yml@refs/heads/develop, PLYS-NETWORK/plys-dev-ops/.github/workflows/deploy-dev.yml@refs/heads/develop
```

**`plys-prod-runners`** (`refs/heads/main`, 22 workflows):

```
PLYS-NETWORK/plys-internal-hub-service-api/.github/workflows/deploy-prod.yml@refs/heads/main, PLYS-NETWORK/plys-internal-hub-service-api/.github/workflows/deploy-prod.api-gateway.yml@refs/heads/main, PLYS-NETWORK/plys-internal-hub-service-api/.github/workflows/deploy-prod.identity-service.yml@refs/heads/main, PLYS-NETWORK/plys-internal-hub-service-api/.github/workflows/deploy-prod.business-service.yml@refs/heads/main, PLYS-NETWORK/plys-internal-hub-service-api/.github/workflows/deploy-prod.consultant-service.yml@refs/heads/main, PLYS-NETWORK/plys-internal-hub-service-api/.github/workflows/deploy-prod.internal-admin-service.yml@refs/heads/main, PLYS-NETWORK/plys-internal-hub-service-api/.github/workflows/deploy-prod.internal-task-reviewer-service.yml@refs/heads/main, PLYS-NETWORK/plys-internal-hub-service-api/.github/workflows/deploy-prod.finance-service.yml@refs/heads/main, PLYS-NETWORK/plys-internal-hub-service-api/.github/workflows/deploy-prod.notifications-service.yml@refs/heads/main, PLYS-NETWORK/plys-internal-hub-service-api/.github/workflows/deploy-prod.platform-service.yml@refs/heads/main, PLYS-NETWORK/plys-internal-hub-service-api/.github/workflows/deploy-prod.ai-agents-service.yml@refs/heads/main, PLYS-NETWORK/plys-internal-hub-service-api/.github/workflows/deploy-prod.ai-model-service.yml@refs/heads/main, PLYS-NETWORK/plys-internal-hub/.github/workflows/deploy-prod-internal-hub.yml@refs/heads/main, PLYS-NETWORK/plys-internal-hub/.github/workflows/deploy-prod-internal-admin-hub.yml@refs/heads/main, PLYS-NETWORK/plys-internal-hub/.github/workflows/deploy-prod-internal-task-reviewer.yml@refs/heads/main, PLYS-NETWORK/plys-internal-hub/.github/workflows/deploy-prod-all.yml@refs/heads/main, PLYS-NETWORK/plys-monorepo-webapps/.github/workflows/deploy-prod-ployos-app.yml@refs/heads/main, PLYS-NETWORK/plys-monorepo-webapps/.github/workflows/deploy-prod-lonaos-app.yml@refs/heads/main, PLYS-NETWORK/plys-monorepo-webapps/.github/workflows/deploy-prod-ployos-marketing.yml@refs/heads/main, PLYS-NETWORK/plys-monorepo-webapps/.github/workflows/deploy-prod-lonaos-marketing.yml@refs/heads/main, PLYS-NETWORK/plys-monorepo-webapps/.github/workflows/deploy-prod-all.yml@refs/heads/main, PLYS-NETWORK/plys-dev-ops/.github/workflows/deploy-prod.yml@refs/heads/main
```

---

## 5. Register runner

Register each VPS against the **organization** URL and assign the runner to the matching group with `--runnergroup`.

Use **repository** runners only when a single repo owns the VPS. For Plys, prefer **organization runners** + runner groups (Section 4).

Run on the VPS as `github-runner`:

```bash
sudo -u github-runner -i
mkdir -p ~/actions-runner
cd ~/actions-runner
```

Download the Linux x64 runner package from the GitHub setup page, then configure it with environment-specific labels.

Example install (replace `RUNNER_VERSION` and `RUNNER_TOKEN_FROM_GITHUB` from GitHub):

```bash
RUNNER_VERSION="2.323.0"
curl -fsSL -o actions-runner-linux-x64.tar.gz \
  "https://github.com/actions/runner/releases/download/v${RUNNER_VERSION}/actions-runner-linux-x64-${RUNNER_VERSION}.tar.gz"
tar xzf actions-runner-linux-x64.tar.gz
```

**Dev VPS** — organization URL + dev runner group:

```bash
./config.sh \
  --url https://github.com/plys-network \
  --token RUNNER_TOKEN_FROM_GITHUB \
  --name plys-dev-vps-1 \
  --runnergroup plys-dev-runners \
  --labels plys-dev-vps \
  --work _work \
  --unattended
```

**Prod VPS** — organization URL + prod runner group:

```bash
./config.sh \
  --url https://github.com/plys-network \
  --token RUNNER_TOKEN_FROM_GITHUB \
  --name plys-prod-vps-1 \
  --runnergroup plys-prod-runners \
  --labels plys-prod-vps \
  --work _work \
  --unattended
```

The runner automatically includes the `self-hosted`, OS, and architecture labels. `--runnergroup` must match a group created in Section 4 — registration fails if the group does not exist.

**Repository runner** (single repo only):

```bash
./config.sh \
  --url https://github.com/PLYS-NETWORK/REPO_NAME \
  --token RUNNER_TOKEN_FROM_GITHUB \
  --name plys-dev-vps-1 \
  --labels plys-dev-vps \
  --work _work \
  --unattended
```

Confirm in GitHub: **Settings** → **Actions** → **Runners** — runner shows the correct **Runner group** and **Idle** status.

---

## 6. Install systemd service

`github-runner` has **no sudo**. Install the service as your **admin SSH user** (e.g. `ubuntu`), not from inside the `github-runner` shell.

**On VPS** — exit the runner user if you are still logged in as `github-runner`:

```bash
exit   # back to ubuntu / your deploy user
```

Install and start the service from the runner directory:

```bash
cd /home/github-runner/actions-runner

sudo ./svc.sh install github-runner
sudo ./svc.sh start
sudo ./svc.sh status
```

`install github-runner` means “run the service as Linux user `github-runner`” — it does **not** mean “run this command while logged in as `github-runner`”.

Confirm the runner appears as **Idle** in GitHub.

If the runner cannot access Docker:

```bash
groups github-runner
sudo systemctl restart 'actions.runner.*.service'
```

| Error | Fix |
|-------|-----|
| `sudo: I'm sorry github-runner. I'm afraid I can't do that` | You ran `sudo` as `github-runner`. `exit` to your admin user, then run `sudo ./svc.sh ...` from `/home/github-runner/actions-runner`. |
| `Must run as root` / permission denied on `svc.sh` | Same — use admin user + `sudo`, not `github-runner` + `sudo`. |

---

## 7. Workflow changes (three monorepos)

Deploy workflows in all three repos target **organization runner groups**. Build/push may stay on `ubuntu-latest`; the **deploy job** runs on the VPS runner and copies the bundle locally (no SSH/SCP).

| Repo | Dev workflows | Prod workflows | VPS path |
|------|---------------|----------------|----------|
| `plys-internal-hub-service-api` | `deploy-dev.yml`, `deploy-dev.*.yml` | `deploy-prod.yml`, `deploy-prod.*.yml` | `/apps/internal-hub-be/{dev,prod}` |
| `plys-internal-hub` | `deploy-dev-internal-*.yml`, `deploy-dev-all.yml` | `deploy-prod-internal-*.yml`, `deploy-prod-all.yml` | `/apps/internal-hub-fe/{dev,prod}` |
| `plys-monorepo-webapps` | `deploy-dev-*.yml`, `deploy-dev-all.yml` | `deploy-prod-*.yml`, `deploy-prod-all.yml` | `/apps/plys-webapps/{dev,prod}` |

### 7.1 Deploy job `runs-on`

**Dev:**

```yaml
jobs:
  deploy:
    runs-on:
      group: plys-dev-runners
      labels: [self-hosted, linux, x64, plys-dev-vps]
    environment: dev
```

**Prod:**

```yaml
jobs:
  deploy:
    runs-on:
      group: plys-prod-runners
      labels: [self-hosted, linux, x64, plys-prod-vps]
    environment: production
```

Keep `guard` / `resolve` / `build` / `build-migrate` jobs on `ubuntu-latest` (backend only). Prod `guard` (type `deploy`) stays on `ubuntu-latest`.

### 7.2 Backend (`plys-internal-hub-service-api`) — split build vs deploy

`deploy-dev.yml` / `deploy-prod.yml` pattern:

1. **Build** images on `ubuntu-latest` → push to GHCR  
2. **Deploy** on org runner → render env → `prepare-bundle` → **local copy** → `docker-up`

```yaml
      - name: Copy bundle to VPS
        uses: ./.github/actions/deploy/upload-bundle
        with:
          target-dir: /apps/internal-hub-be/dev/current

      - name: Deploy on VPS
        uses: ./.github/actions/deploy/docker-up
        with:
          deploy-env: dev
          app-dir: /apps/internal-hub-be/dev
          ghcr-token: ${{ secrets.GHCR_PULL_TOKEN }}
          service: ${{ needs.resolve.outputs.service }}
          image-tag: ${{ needs.resolve.outputs.image_tag }}
          image-registry: ${{ needs.resolve.outputs.image_registry }}
          run-migrations: ${{ needs.resolve.outputs.run_migrations }}
```

No `VPS_HOST`, `VPS_USER`, `VPS_SSH_KEY`, or `VPS_SSH_PORT`.

### 7.3 Frontend repos — single deploy job on org runner

`plys-internal-hub` and `plys-monorepo-webapps` run build + deploy in one job on the VPS runner via `./.github/actions/deploy/app`:

```yaml
      - name: Deploy internal-hub
        uses: ./.github/actions/deploy/app
        with:
          deploy-env: dev
          service: internal-hub
          app-dir: /apps/internal-hub-fe/dev
          branch: ${{ steps.deploy-ref.outputs.ref }}
          auth-secret: ${{ secrets.AUTH_SECRET }}
          ghcr-token: ${{ secrets.GHCR_PULL_TOKEN }}
```

### 7.4 Composite actions updated

| Action | Change |
|--------|--------|
| `deploy/upload-bundle` | Local `cp` to `target-dir` (replaces `appleboy/scp-action`) |
| `deploy/docker-up` | Runs deploy script on runner host (replaces `appleboy/ssh-action`) |
| `deploy/app` | Drops `vps-host` / `vps-user` / `vps-key` / `vps-port` inputs |

Conversion script (re-run after adding new deploy workflows): `scripts/convert-org-runner-workflows.py` in `plys-dev-ops`.

### 7.5 Run order (GitHub UI)

| Step | Repo | Workflow | Runner group |
|------|------|----------|--------------|
| 1 | `plys-internal-hub-service-api` | Deploy Dev | `plys-dev-runners` |
| 2 | `plys-internal-hub` | Deploy Dev (×3 or `deploy-dev-all`) | `plys-dev-runners` |
| 3 | `plys-monorepo-webapps` | Deploy Dev (×4 or `deploy-dev-all`) | `plys-dev-runners` |
| 4 | `plys-dev-ops` | Deploy monitoring — Dev (after app logs exist) | `plys-dev-runners` |
| 5 | Each app repo | Deploy Prod (manual, type `deploy`) | `plys-prod-runners` |
| 6 | `plys-dev-ops` | Deploy monitoring — Prod (type `deploy`) | `plys-prod-runners` |

---

## 8. Environment optimization

After deploy jobs run on the VPS runner, these secrets are no longer required for those jobs:

| Remove from deploy jobs | Why |
|-------------------------|-----|
| `VPS_HOST` | Job already runs on the target VPS |
| `VPS_USER` | No SSH login needed |
| `VPS_SSH_KEY` | No SSH private key needed |
| `VPS_SSH_PORT` | No SSH connection needed |

Review before deleting globally: other workflows may still use them.

Keep these as secrets when needed:

| Keep | Why |
|------|-----|
| `DB_PASSWORD` | Rendered into app env files |
| `REDIS_PASSWORD` | Rendered into app env files |
| API keys / OAuth secrets / signing secrets | Runtime secrets |
| `GHCR_PULL_TOKEN` | Keep only if the VPS must pull private GHCR images that `GITHUB_TOKEN` cannot access |
| `OPENOBSERVE_ROOT_PASSWORD` | `plys-dev-ops` monitoring deploy only — unique per GitHub environment |

Move non-sensitive constants to GitHub environment variables or hard-coded workflow env:

| Variable | Example |
|----------|---------|
| `APP_DIR` | `/apps/internal-hub-be/dev/current` |
| `DEPLOY_ENV` | `dev` or `prod` |

---

## 9. Safety controls

- Use separate runner **groups** (`plys-dev-runners` / `plys-prod-runners`) and **labels** (`plys-dev-vps` / `plys-prod-vps`) for dev and prod.
- Restrict each group to the four deploy repositories: three app monorepos + `plys-dev-ops` (Section 4.3–4.4).
- Restrict workflow access to deploy workflows on the correct branch when your plan supports it.
- Keep `environment: production` approval rules.
- Use workflow `concurrency` so two deploys cannot update the same `/apps/.../current` directory at once.
- Do not allow pull request workflows from forks to run on these runners.
- Keep runner software updated.
- Keep local `.env` files mode `600`.
- Do not leave new runners in the org **Default** group — always assign `--runnergroup` at registration or move the runner immediately.

Example concurrency:

```yaml
concurrency:
  group: deploy-${{ github.workflow }}-${{ github.ref_name }}
  cancel-in-progress: false
```

---

## 10. Validate

**On VPS:**

Dev:

```bash
curl -sf http://127.0.0.1:4001/api/v1/gateway/health
pm2 list
```

Prod:

```bash
curl -sf http://127.0.0.1:4000/api/v1/gateway/health
pm2 list
```

**On GitHub:**

| Check | Dev | Prod |
|-------|-----|------|
| Runner group | `plys-dev-runners` | `plys-prod-runners` |
| Runner name | `plys-dev-vps-1` (or your name) | `plys-prod-vps-1` |
| Labels | includes `plys-dev-vps` | includes `plys-prod-vps` |
| Status | **Idle** | **Idle** |
| Deploy job | `runs-on.group` = `plys-dev-runners` | `runs-on.group` = `plys-prod-runners` |

- No deploy step references `VPS_HOST`, `VPS_USER`, `VPS_SSH_KEY`, or `VPS_SSH_PORT`.
- A dev workflow cannot queue on a prod runner (and vice versa) when groups and labels are configured correctly.
