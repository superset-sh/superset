#!/usr/bin/env bash
set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
NC='\033[0m'

error() { echo -e "${RED}✗${NC} $1"; exit 1; }
success() { echo -e "${GREEN}✓${NC} $1"; }

echo "🧹 Tearing down Superset workspace..."

# Load local .env
if [ -f ".env" ]; then
  # shellcheck disable=SC1091
  set -a
  source .env
  set +a
fi

# Check dependencies
command -v neonctl &> /dev/null || error "Neon CLI not installed. Run: npm install -g neonctl"
command -v docker &> /dev/null || error "Docker not installed. Install from https://docker.com"

# Check required environment variables
NEON_PROJECT_ID="${NEON_PROJECT_ID:-}"
[ -z "$NEON_PROJECT_ID" ] && error "NEON_PROJECT_ID environment variable is required"

BRANCH_ID="${NEON_BRANCH_ID:-}"
if [ -z "$BRANCH_ID" ]; then
  error "No NEON_BRANCH_ID found in .env; cannot delete branch"
fi

WORKSPACE_NAME="${SUPERSET_WORKSPACE_NAME:-$(basename "$PWD")}"

# Stop and remove Electric SQL container
ELECTRIC_CONTAINER="${ELECTRIC_CONTAINER:-superset-electric-$WORKSPACE_NAME}"

echo "⚡ Stopping Electric SQL container..."
if docker ps -a --format '{{.Names}}' | grep -q "^${ELECTRIC_CONTAINER}$"; then
  docker stop "$ELECTRIC_CONTAINER" &> /dev/null || true
  docker rm "$ELECTRIC_CONTAINER" &> /dev/null || true
  success "Electric container stopped: $ELECTRIC_CONTAINER"
else
  echo "⚠️  Electric container '$ELECTRIC_CONTAINER' not found or already removed"
fi

# Delete Neon branch for this workspace
echo "🗄️  Deleting Neon branch: $WORKSPACE_NAME ($BRANCH_ID)"
if neonctl branches delete "$BRANCH_ID" --project-id "$NEON_PROJECT_ID" --force 2>/dev/null; then
  success "Neon branch deleted: $WORKSPACE_NAME"
else
  echo "⚠️  Neon branch '$WORKSPACE_NAME' ($BRANCH_ID) not found or already deleted"
fi

echo "✨ Teardown complete!"
