#!/usr/bin/env bash
set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
NC='\033[0m'

error() { echo -e "${RED}✗${NC} $1"; exit 1; }
success() { echo -e "${GREEN}✓${NC} $1"; }

echo "🧹 Tearing down Superset workspace..."

# Check dependencies
command -v neonctl &> /dev/null || error "Neon CLI not installed. Run: npm install -g neonctl"

# Delete Neon branch for this workspace
WORKSPACE_NAME="${SUPERSET_WORKSPACE_NAME:-$(basename "$PWD")}"

echo "🗄️  Deleting Neon branch: $WORKSPACE_NAME"
if neonctl branches delete "$WORKSPACE_NAME" --project-id tiny-cherry-82420694 --force 2>/dev/null; then
  success "Neon branch deleted: $WORKSPACE_NAME"
else
  echo "⚠️  Neon branch '$WORKSPACE_NAME' not found or already deleted"
fi

echo "✨ Teardown complete!"
