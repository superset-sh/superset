/**
 * OpenComputer image for Superset host-service sandboxes.
 *
 * Static setup is baked into the image so spawn time is dominated by VM boot,
 * not by package installs. The only runtime work the spawner does is:
 *   1. exec /usr/local/bin/superset-init.sh   (materialize secrets + start dockerd + host-service)
 *   2. talk to the host-service via the Superset SDK
 *
 * Layer ordering: rarely-changes first, volatile last. A new commit on
 * superset main only invalidates the final clone+bun-install layer; apt deps,
 * binaries, and CLI installers stay cached across image rebuilds.
 */

// Image lives on the `/node` subpath because it touches the local filesystem
// (addLocalFile/addLocalDir). The main "@opencomputer/sdk" entry is browser-safe.
import { Image } from "@opencomputer/sdk/node";

export const REPO_PATH = "/root/code/superset";

const INIT_SCRIPT = `#!/usr/bin/env bash
# Boot Superset inside an OpenComputer sandbox. Idempotent.
set -euo pipefail

: "\${DOPPLER_TOKEN:?DOPPLER_TOKEN must be set when spawning the sandbox}"
: "\${DOPPLER_PROJECT:?DOPPLER_PROJECT must be set}"
: "\${DOPPLER_CONFIG:?DOPPLER_CONFIG must be set}"

# Materialize tier-2 (project-shared) secrets into the root .env. Each worktree
# picks them up via direnv when setup.sh runs.
doppler secrets download --no-file --format env \\
  --project "\$DOPPLER_PROJECT" --config "\$DOPPLER_CONFIG" \\
  > "${REPO_PATH}/.env"
chmod 600 "${REPO_PATH}/.env"

# Export so child processes (host-service) see secrets on first launch.
set -a; . "${REPO_PATH}/.env"; set +a

# dockerd binary is baked; daemon launches at runtime. Skip if already up.
if ! pgrep -x dockerd > /dev/null; then
  sudo dockerd --iptables=false > /var/log/dockerd.log 2>&1 &
  until docker info > /dev/null 2>&1; do sleep 1; done
fi

# SUPERSET_API_KEY (now in env) makes superset start non-interactive.
superset start --daemon
`;

export const supersetImage = Image.base()
  // ── Layer tier 1: system packages (rarely change) ───────────────────────────
  .aptInstall([
    "docker.io",
    "jq",
    "postgresql-client",
    "libnss3-tools",
    "direnv",
  ])

  // ── Layer tier 2: standalone binaries (rarely change) ───────────────────────
  // Caddy is the HTTP/2 reverse proxy for Electric SSE streams; avoids the
  // browser 6-connection limit when running many streams.
  // NOTE: runCommands takes rest args (...string), not an array. Each call is
  // one cache step on the OC server; commands within a single call run together.
  .runCommands(
    `curl -fsSL "https://caddyserver.com/api/download?os=linux&arch=amd64" \
       -o /usr/local/bin/caddy && chmod +x /usr/local/bin/caddy`,
    `curl -Ls https://cli.doppler.com/install.sh | sh`,
  )

  // ── Layer tier 3: node global tooling (rarely change) ───────────────────────
  // node-gyp must exist BEFORE the bun install layer because node-pty's
  // native build invokes it. Repo convention is bun, but bun -g treats
  // CLIs differently and node-gyp expects to be on PATH as `node-gyp`,
  // so npm -g is the pragmatic choice for these.
  .runCommands(`npm install -g node-gyp neonctl`)

  // ── Layer tier 4: agent + Superset CLIs (rarely change) ─────────────────────
  .runCommands(
    `curl -fsSL https://superset.sh/cli/install.sh | sh`,
    `curl -fsSL https://claude.ai/install.sh | bash`,
  )

  // ── Layer tier 5: shell hooks (rarely change) ───────────────────────────────
  .runCommands(`echo 'eval "$(direnv hook bash)"' >> /root/.bashrc`)

  // ── Layer tier 6: init script (changes when orchestration logic moves) ──────
  .addFile("/usr/local/bin/superset-init.sh", INIT_SCRIPT)
  .runCommands(`chmod +x /usr/local/bin/superset-init.sh`)

  // ── Layer tier 7: VOLATILE — repo clone + dependency resolution ─────────────
  // Busts on every Superset main commit. Keep last so cache hits on upstream
  // layers survive across image rebuilds. Three commands stay in one step
  // because they're a single logical unit (clone → install → wire).
  .runCommands(
    `git clone https://github.com/superset-sh/superset ${REPO_PATH}`,
    `cd ${REPO_PATH} && bun install`,
    `cp ${REPO_PATH}/Caddyfile.example ${REPO_PATH}/Caddyfile`,
  )

  .env({
    SUPERSET_HOME: "/root/superset",
    SUPERSET_REPO: REPO_PATH,
  })

  .workdir(REPO_PATH);
