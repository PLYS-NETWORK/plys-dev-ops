#!/usr/bin/env python3
"""Convert deploy workflows to organization self-hosted runner groups."""

from __future__ import annotations

import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]

DEV_RUNS_ON = """    runs-on:
      group: plys-dev-runners
      labels: [self-hosted, linux, x64, plys-dev-vps]"""

PROD_RUNS_ON = """    runs-on:
      group: plys-prod-runners
      labels: [self-hosted, linux, x64, plys-prod-vps]"""

UPLOAD_BUNDLE = """name: 'Copy deploy bundle to VPS'
description: 'Copy deploy bundle to local VPS path (organization self-hosted runner)'

inputs:
  target-dir:
    description: 'Deploy directory on the VPS runner'
    required: true

runs:
  using: 'composite'
  steps:
    - name: Copy deploy bundle locally
      shell: bash
      run: |
        set -euo pipefail
        TARGET="${{ inputs.target-dir }}"
        mkdir -p "$TARGET"
        shopt -s dotglob nullglob
        cp -a deploy-package/* "$TARGET/"
        echo "Copied deploy bundle to ${TARGET}"
"""


def convert_docker_up(path: Path) -> bool:
    text = path.read_text()
    if "appleboy/ssh-action" not in text:
        return False

    m = re.search(
        r"    - name: Deploy on VPS\n"
        r"      uses: appleboy/ssh-action@v1\.0\.3\n"
        r"      with:\n"
        r"        host: \$\{\{ inputs\.host \}\}\n"
        r"        username: \$\{\{ inputs\.username \}\}\n"
        r"        key: \$\{\{ inputs\.key \}\}\n"
        r"        port: \$\{\{ inputs\.port \}\}\n"
        r"        script: \|\n"
        r"((?:          .*\n)+)",
        text,
    )
    if not m:
        raise RuntimeError(f"Could not parse docker-up script block: {path}")

    script = "\n".join(
        line[10:] if line.startswith("          ") else line.rstrip()
        for line in m.group(1).splitlines()
    )

    text = re.sub(
        r"  host:\n    description: 'VPS host'\n    required: true\n"
        r"  username:\n    description: 'VPS username'\n    required: true\n"
        r"  key:\n    description: 'SSH private key'\n    required: true\n"
        r"  port:\n    description: 'SSH port'\n    required: true\n",
        "",
        text,
    )
    text = text.replace(
        "description: 'Pull images, run migrations, reload PM2 per-service stack'",
        "description: 'Pull images, run migrations, reload PM2 on VPS self-hosted runner'",
    )
    text = text.replace(
        "description: 'Pull images, start containers, reload PM2 per-service monitors'",
        "description: 'Pull images, start containers, reload PM2 on VPS self-hosted runner'",
    )

    deploy_step = (
        "    - name: Deploy on VPS\n"
        "      shell: bash\n"
        "      run: |\n"
        + "\n".join(f"        {line}" if line else "" for line in script.splitlines())
        + "\n"
    )
    text = re.sub(
        r"    - name: Deploy on VPS\n"
        r"      uses: appleboy/ssh-action@v1\.0\.3\n"
        r"      with:\n"
        r"        host: \$\{\{ inputs\.host \}\}\n"
        r"        username: \$\{\{ inputs\.username \}\}\n"
        r"        key: \$\{\{ inputs\.key \}\}\n"
        r"        port: \$\{\{ inputs\.port \}\}\n"
        r"        script: \|\n"
        r"(?:          .*\n)+",
        deploy_step,
        text,
    )
    path.write_text(text)
    return True


def patch_deploy_job_runs_on(content: str, is_prod: bool) -> str:
    lines = content.splitlines()
    out: list[str] = []
    i = 0
    while i < len(lines):
        line = lines[i]
        if line == "  deploy:":
            out.append(line)
            i += 1
            while i < len(lines) and not re.match(r"^  [a-zA-Z0-9_-]+:", lines[i]):
                if lines[i].strip() == "runs-on: ubuntu-latest":
                    out.append(DEV_RUNS_ON if not is_prod else PROD_RUNS_ON)
                else:
                    out.append(lines[i])
                i += 1
            continue
        out.append(line)
        i += 1
    return "\n".join(out) + ("\n" if content.endswith("\n") else "")


def strip_vps_secrets(content: str) -> str:
    content = re.sub(r"\n\s+host: \$\{\{ secrets\.VPS_HOST \}\}", "", content)
    content = re.sub(r"\n\s+username: \$\{\{ secrets\.VPS_USER \}\}", "", content)
    content = re.sub(r"\n\s+key: \$\{\{ secrets\.VPS_SSH_KEY \}\}", "", content)
    content = re.sub(r"\n\s+port: \$\{\{ secrets\.VPS_SSH_PORT \}\}", "", content)
    content = re.sub(r"\n\s+vps-host: \$\{\{ secrets\.VPS_HOST \}\}", "", content)
    content = re.sub(r"\n\s+vps-user: \$\{\{ secrets\.VPS_USER \}\}", "", content)
    content = re.sub(r"\n\s+vps-key: \$\{\{ secrets\.VPS_SSH_KEY \}\}", "", content)
    content = re.sub(r"\n\s+vps-port: \$\{\{ secrets\.VPS_SSH_PORT \}\}", "", content)
    content = content.replace(
        "      - name: Upload to VPS",
        "      - name: Copy bundle to VPS",
    )
    return content


def patch_app_action(path: Path) -> None:
    text = path.read_text()
    for block in [
        r"  vps-host:\n    description: 'VPS host'\n    required: true\n",
        r"  vps-user:\n    description: 'VPS SSH user'\n    required: true\n",
        r"  vps-key:\n    description: 'VPS SSH private key'\n    required: true\n",
        r"  vps-port:\n    description: 'VPS SSH port'\n    required: true\n",
    ]:
        text = re.sub(block, "", text)
    text = re.sub(
        r"    - name: Upload to VPS\n      uses: \./\.github/actions/deploy/upload-bundle\n      with:\n"
        r"        host: \$\{\{ inputs\.vps-host \}\}\n"
        r"        username: \$\{\{ inputs\.vps-user \}\}\n"
        r"        key: \$\{\{ inputs\.vps-key \}\}\n"
        r"        port: \$\{\{ inputs\.vps-port \}\}\n"
        r"        target-dir: \$\{\{ inputs\.app-dir \}\}/current",
        "    - name: Copy bundle to VPS\n      uses: ./.github/actions/deploy/upload-bundle\n      with:\n        target-dir: ${{ inputs.app-dir }}/current",
        text,
    )
    text = re.sub(
        r"    - name: Deploy on VPS\n      uses: \./\.github/actions/deploy/docker-up\n      with:\n"
        r"        host: \$\{\{ inputs\.vps-host \}\}\n"
        r"        username: \$\{\{ inputs\.vps-user \}\}\n"
        r"        key: \$\{\{ inputs\.vps-key \}\}\n"
        r"        port: \$\{\{ inputs\.vps-port \}\}\n"
        r"        deploy-env: \$\{\{ inputs\.deploy-env \}\}",
        "    - name: Deploy on VPS\n      uses: ./.github/actions/deploy/docker-up\n      with:\n        deploy-env: ${{ inputs.deploy-env }}",
        text,
    )
    text = text.replace(
        "description: 'Build image(s), prepare bundle, upload, and run docker compose on the VPS'",
        "description: 'Build image(s), prepare bundle, copy locally, and run docker compose on VPS runner'",
    )
    path.write_text(text)


def main() -> None:
    repos = [
        ROOT / "plys-internal-hub-serivce-api",
        ROOT / "plys-internal-hub",
        ROOT / "plys-monorepo-webapps",
    ]

    for repo in repos:
        upload = repo / ".github/actions/deploy/upload-bundle/action.yml"
        upload.write_text(UPLOAD_BUNDLE)
        print(f"updated {upload}")

        docker_up = repo / ".github/actions/deploy/docker-up/action.yml"
        convert_docker_up(docker_up)
        print(f"updated {docker_up}")

        app_action = repo / ".github/actions/deploy/app/action.yml"
        if app_action.exists():
            patch_app_action(app_action)
            print(f"updated {app_action}")

        wf_dir = repo / ".github/workflows"
        for wf in sorted(wf_dir.glob("deploy*.yml")):
            is_prod = "deploy-prod" in wf.name or wf.name.endswith("prod.yml")
            text = wf.read_text()
            if "  deploy:" not in text:
                continue
            text = patch_deploy_job_runs_on(text, is_prod=is_prod)
            text = strip_vps_secrets(text)
            wf.write_text(text)
            print(f"updated {wf}")


if __name__ == "__main__":
    main()
