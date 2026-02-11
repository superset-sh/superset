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

# Install native dependencies for desktop app
bun run --filter=@superset/desktop install:deps
