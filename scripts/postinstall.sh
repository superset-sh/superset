#!/bin/bash
# Prevent infinite recursion during postinstall
# electron-builder install-app-deps can trigger nested bun installs
# which would re-run postinstall, spawning hundreds of processes

if [ -n "$SUPERSET_POSTINSTALL_RUNNING" ]; then
  exit 0
fi

export SUPERSET_POSTINSTALL_RUNNING=1

# Run sherif for workspace validation
sherif

# GitHub CI runs multiple Bun install jobs that do not need desktop native rebuilds.
# Running electron-builder here can trigger nested Bun installs while the main
# install is still materializing packages, which has been flaky with native deps.
if [ -n "$CI" ]; then
  exit 0
fi

# Install native dependencies for desktop app
bun run --filter=@superset/desktop install:deps
