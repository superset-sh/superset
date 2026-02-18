#!/usr/bin/env bash
set -euo pipefail

echo "==> Killing Electron / electron-vite / node processes..."
pkill -f "electron-vite" 2>/dev/null || true
pkill -f "electron ." 2>/dev/null || true
# Give processes a moment to die
sleep 0.5

REPO_ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
DESKTOP_DIR="$REPO_ROOT/apps/desktop"

echo "==> Cleaning turbo cache (repo-wide)..."
rm -rf "$REPO_ROOT/.turbo"

echo "==> Cleaning desktop build artifacts..."
rm -rf "$DESKTOP_DIR/.turbo" \
       "$DESKTOP_DIR/.cache" \
       "$DESKTOP_DIR/dist" \
       "$DESKTOP_DIR/dist-electron" \
       "$DESKTOP_DIR/node_modules/.dev"

echo "==> Cleaning tsbuildinfo files..."
find "$REPO_ROOT" -name "*.tsbuildinfo" -type f -delete 2>/dev/null || true
find "$REPO_ROOT" -name "tsbuildinfo.json" -path "*/.cache/*" -type f -delete 2>/dev/null || true

echo "==> Starting desktop dev server..."
cd "$DESKTOP_DIR"
exec bun dev
