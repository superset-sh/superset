#!/usr/bin/env bash
# Cloud Agent install: refresh dependencies and prepare the local dev stack.
#
# With environment builds this runs once to create the baseline snapshot; the
# node_modules, generated .env, pulled Docker images, and the migrated+seeded
# Postgres volume it produces are all baked into that snapshot. Per-boot
# bring-up lives in start.sh. Idempotent: safe to re-run.
set -euo pipefail
export PATH="$HOME/.bun/bin:$PATH"
cd "$(git rev-parse --show-toplevel 2>/dev/null || echo /workspace)"

# The dev DB stack (Postgres + neon-http proxy + Redis + SRH shim) runs in
# Docker; bring the nested daemon up so the setup below can create it and run
# migrate/seed against it.
./.cursor/docker-up.sh

# Regenerate .env from scratch so repeated installs never append duplicate
# workspace-override blocks (setup.local.sh appends on every run).
rm -f .env

# Reuse the repository's maintained local-dev setup end to end: bun install,
# per-workspace .env, the Docker DB stack, database migrations, and the seeded
# dev account (admin@local.test / supersetdev). No external credentials needed.
./.superset/setup.local.sh
