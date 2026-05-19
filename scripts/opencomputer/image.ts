/**
 * OpenComputer image for Superset host-service sandboxes.
 *
 * Tuned for the OC base image:
 *   - Sandboxes run as user `sandbox` (UID 1000), HOME=/home/sandbox
 *   - sudo -n works passwordless, so root-only operations are fine
 *   - Pre-installed: claude (CLI), jq, docker (CLI only — no daemon), node, npm, git
 *   - NOT installed: bun, direnv, caddy, doppler, dockerd, postgresql-client
 *
 * Static setup is baked into the image so spawn time is dominated by VM boot,
 * not by package installs. The only runtime work the spawner does is exec
 * /usr/local/bin/superset-init.sh (materialize secrets + start dockerd +
 * host-service) then talk to the host-service via the Superset SDK.
 *
 * Layer ordering: rarely-changes first, volatile last. A new commit on
 * superset main only invalidates the final clone+bun-install layer; apt deps,
 * binaries, and CLI installers stay cached across image rebuilds.
 */

import { Image } from "@opencomputer/sdk/node";

export const REPO_PATH = "/home/sandbox/code/superset";

const INIT_SCRIPT = `#!/usr/bin/env bash
# Boot Superset inside an OpenComputer sandbox. Idempotent.
set -euo pipefail

: "\${DOPPLER_TOKEN:?DOPPLER_TOKEN must be set when spawning the sandbox}"
: "\${DOPPLER_PROJECT:?DOPPLER_PROJECT must be set}"
: "\${DOPPLER_CONFIG:?DOPPLER_CONFIG must be set}"

# bun install runs here, not at image build time, because the OC build stream
# times out before the monorepo's 1100+ packages resolve. After first run the
# resolved node_modules persists in the sandbox checkpoint.
export PATH="\$HOME/.bun/bin:\$PATH"
if [ ! -d "${REPO_PATH}/node_modules" ]; then
  cd "${REPO_PATH}" && bun install
fi

# Materialize tier-2 (project-shared) secrets into the root .env. Each worktree
# picks them up via direnv when setup.sh runs.
doppler secrets download --no-file --format env \\
  --project "\$DOPPLER_PROJECT" --config "\$DOPPLER_CONFIG" \\
  > "${REPO_PATH}/.env"
chmod 600 "${REPO_PATH}/.env"

# Export so child processes (host-service) see secrets on first launch.
set -a; . "${REPO_PATH}/.env"; set +a

# dockerd is in apt; daemon launches at runtime. Skip if already up.
if ! pgrep -x dockerd > /dev/null; then
  sudo dockerd --iptables=false > /var/log/dockerd.log 2>&1 &
  until sudo docker info > /dev/null 2>&1; do sleep 1; done
fi

# SUPERSET_API_KEY (now in env) makes superset start non-interactive.
superset start --daemon
`;

export const supersetImage = Image.base()
  // ── Tier 1: system packages (rarely change) ─────────────────────────────────
  // jq is pre-installed in the base image, skip it. docker.io brings dockerd
  // (CLI is already there). libnss3-tools so caddy can install its local CA.
  .aptInstall([
    "docker.io",
    "postgresql-client",
    "libnss3-tools",
    "direnv",
  ])

  // ── Tier 2: standalone binaries to /usr/local/bin (rarely change) ───────────
  // /usr/local/bin is owned by root in the base image; sudo -n is passwordless.
  // Caddy = HTTP/2 reverse proxy for Electric SSE streams. Doppler CLI fetches
  // tier-2 secrets at runtime (init script).
  .runCommands(
    `curl -fsSL "https://caddyserver.com/api/download?os=linux&arch=amd64" -o /tmp/caddy && sudo mv /tmp/caddy /usr/local/bin/caddy && sudo chmod +x /usr/local/bin/caddy`,
    `curl -Ls https://cli.doppler.com/install.sh | sudo sh`,
  )

  // ── Tier 3: bun (user-local at $HOME/.bun) ──────────────────────────────────
  // bun is the repo's package manager and provides bunx for node-gyp invocations
  // during the volatile bun-install layer. Pinning bun version prevents drift.
  .runCommands(`curl -fsSL https://bun.sh/install | bash`)

  // ── Tier 4: node global tooling (rarely change) ─────────────────────────────
  // node-gyp must exist BEFORE the bun install layer because node-pty's native
  // build invokes it. Installs to /usr/local/lib/node_modules/ via sudo.
  .runCommands(`sudo npm install -g node-gyp neonctl`)

  // ── Tier 5: Superset CLI (rarely changes) ───────────────────────────────────
  // Installer drops the binary at $HOME/superset/bin/superset and edits
  // $HOME/.bashrc to add it to PATH. Claude Code is pre-installed, skip.
  .runCommands(`curl -fsSL https://superset.sh/cli/install.sh | sh`)

  // ── Tier 6: shell hooks (rarely change) ─────────────────────────────────────
  // Direnv hook + ensure $HOME/.bun/bin is on PATH for non-login shells too.
  .runCommands(
    `echo 'export PATH="$HOME/.bun/bin:$HOME/superset/bin:$PATH"' >> /home/sandbox/.bashrc`,
    `echo 'eval "$(direnv hook bash)"' >> /home/sandbox/.bashrc`,
  )

  // ── Tier 7: init script (changes when orchestration logic moves) ────────────
  // addFile runs server-side as root, so the file lands root-owned. chmod via
  // sudo to make it executable for `sandbox`.
  .addFile("/usr/local/bin/superset-init.sh", INIT_SCRIPT)
  .runCommands(`sudo chmod +x /usr/local/bin/superset-init.sh`)

  // ── Tier 8: VOLATILE — repo clone + Caddyfile (cheap) ───────────────────────
  // Just clone and copy the Caddyfile. We deliberately do NOT run `bun install`
  // at image build time because the OC image-build SSE stream times out before
  // it finishes (the monorepo's 1100+ packages take ~2 min). bun install runs
  // at sandbox start instead, with the result persisted in the sandbox's own
  // checkpoint after the first hibernate.
  .runCommands(
    `git clone --depth 1 https://github.com/superset-sh/superset ${REPO_PATH}`,
    `cp ${REPO_PATH}/Caddyfile.example ${REPO_PATH}/Caddyfile`,
  )

  // System-wide env (writes to /etc/environment, picked up by login shells).
  .env({
    SUPERSET_HOME: "/home/sandbox/superset",
    SUPERSET_REPO: REPO_PATH,
    PATH: "/home/sandbox/.bun/bin:/home/sandbox/superset/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin",
  })

  .workdir(REPO_PATH);
