#!/usr/bin/env bash
set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
NC='\033[0m'

error() { echo -e "${RED}✗${NC} $1"; exit 1; }
success() { echo -e "${GREEN}✓${NC} $1"; }

echo "🚀 Setting up Superset workspace..."

# Check dependencies
command -v bun &> /dev/null || error "Bun not installed. Install from https://bun.sh"
command -v neonctl &> /dev/null || error "Neon CLI not installed. Run: npm install -g neonctl"
command -v jq &> /dev/null || error "jq not installed. Run: brew install jq"

# Check required environment variables
NEON_PROJECT_ID="${NEON_PROJECT_ID:-}"
[ -z "$NEON_PROJECT_ID" ] && error "NEON_PROJECT_ID environment variable is required"

# Install dependencies
echo "📥 Installing dependencies..."
bun install
success "Dependencies installed"

# Link direnv config from root repo if it exists
if [ -n "$SUPERSET_ROOT_PATH" ] && [ -f "$SUPERSET_ROOT_PATH/.envrc" ]; then
  echo "🔧 Linking .envrc..."
  ln -sf "$SUPERSET_ROOT_PATH/.envrc" .envrc
  if command -v direnv &> /dev/null; then
    direnv allow
  fi
  success "direnv configured"
fi

# Create Neon branch for this workspace
echo "🗄️  Creating Neon branch..."
WORKSPACE_NAME="${SUPERSET_WORKSPACE_NAME:-$(basename "$PWD")}"
NEON_OUTPUT=$(neonctl branches create \
  --project-id "$NEON_PROJECT_ID" \
  --name "$WORKSPACE_NAME" \
  --output json)

# Parse connection strings from create output
BRANCH_ID=$(echo "$NEON_OUTPUT" | jq -r '.branch.id')
DIRECT_URL=$(echo "$NEON_OUTPUT" | jq -r '.connection_uris[0].connection_uri')
POOLER_HOST=$(echo "$NEON_OUTPUT" | jq -r '.connection_uris[0].connection_parameters.pooler_host')
PASSWORD=$(echo "$NEON_OUTPUT" | jq -r '.connection_uris[0].connection_parameters.password')
ROLE=$(echo "$NEON_OUTPUT" | jq -r '.connection_uris[0].connection_parameters.role')
DATABASE=$(echo "$NEON_OUTPUT" | jq -r '.connection_uris[0].connection_parameters.database')
POOLED_URL="postgresql://${ROLE}:${PASSWORD}@${POOLER_HOST}/${DATABASE}?sslmode=require"

cat >> .env << EOF
NEON_BRANCH_ID=$BRANCH_ID
DATABASE_URL=$POOLED_URL
DATABASE_URL_UNPOOLED=$DIRECT_URL
EOF

success "Neon branch created: $WORKSPACE_NAME"
echo "✨ Done!"
