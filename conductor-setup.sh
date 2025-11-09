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

# Link direnv config
echo "🔧 Linking .envrc..."
ln -sf "$CONDUCTOR_ROOT_PATH/.envrc" .envrc
success "direnv configured"

# Create Neon branch for this workspace
echo "🗄️  Creating Neon branch..."
WORKSPACE_NAME=$(basename "${CONDUCTOR_WORKSPACE_PATH:-$PWD}")
NEON_OUTPUT=$(neonctl branches create \
  --project-id tiny-cherry-82420694 \
  --name "$WORKSPACE_NAME" \
  --output json)

# Parse connection strings and create .env
DATABASE_URL=$(echo "$NEON_OUTPUT" | jq -r '.connection_uris[0].connection_uri')
DATABASE_POOLED_URL=$(echo "$NEON_OUTPUT" | jq -r '.connection_uris[1].connection_uri // empty')

cat > .env << EOF
DATABASE_URL=$DATABASE_URL
DATABASE_POOLED_URL=$DATABASE_POOLED_URL
EOF

success "Neon branch created: $WORKSPACE_NAME"
echo "✨ Done!"
