#!/usr/bin/env bash
set -e

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
  --project-id tiny-cherry-82420694 \
  --name "$WORKSPACE_NAME" \
  --output json 2>&1 | grep -v "^WARNING:")

# Parse connection strings from create output
DATABASE_URL=$(echo "$NEON_OUTPUT" | jq -r '.connection_uris[0].connection_uri')
POOLER_HOST=$(echo "$NEON_OUTPUT" | jq -r '.connection_uris[0].connection_parameters.pooler_host')
PASSWORD=$(echo "$NEON_OUTPUT" | jq -r '.connection_uris[0].connection_parameters.password')
ROLE=$(echo "$NEON_OUTPUT" | jq -r '.connection_uris[0].connection_parameters.role')
DATABASE=$(echo "$NEON_OUTPUT" | jq -r '.connection_uris[0].connection_parameters.database')
DATABASE_POOLED_URL="postgresql://${ROLE}:${PASSWORD}@${POOLER_HOST}/${DATABASE}?sslmode=require"

cat > .env << EOF
DATABASE_URL=$DATABASE_URL
DATABASE_POOLED_URL=$DATABASE_POOLED_URL
EOF

success "Neon branch created: $WORKSPACE_NAME"
echo "✨ Done!"
