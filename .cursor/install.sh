#!/usr/bin/env bash
# Cloud Agent install phase: refresh workspace dependencies after checkout.
#
# Slow, stable system tooling (Bun, Docker, fuse-overlayfs) lives in the base
# snapshot, not here. This script only reconciles source-derived state, so it
# must stay idempotent and terminate — no daemons, servers, or migrations.
set -euo pipefail

export PATH="$HOME/.bun/bin:$PATH"
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

echo "==> bun install"
# postinstall compiles the Lingui catalogs and rebuilds the desktop native deps.
bun install

echo "==> ensure babel-plugin-macros (optional @lingui/core peer)"
# The apps strip `@lingui/*/macro` imports at build time via @lingui/swc-plugin,
# but `.superset/setup.local.sh` runs `bun run db:seed-dev` unbundled, so the
# macro shim tries to load babel-plugin-macros at runtime. It is an OPTIONAL
# peer of @lingui/core, so bun never installs it automatically. --no-save keeps
# it out of the committed package.json / bun.lock.
if [ ! -d node_modules/babel-plugin-macros ]; then
  bun add babel-plugin-macros@3 --no-save
fi

echo "==> install complete"
