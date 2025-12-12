#!/usr/bin/env bash
set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
NC='\033[0m'

error() { echo -e "${RED}✗${NC} $1"; exit 1; }
success() { echo -e "${GREEN}✓${NC} $1"; }

echo "🚀 Setting up Superset workspace..."

# Load root .env for this script (provides NEON_PROJECT_ID, etc.)
if [ -n "$SUPERSET_ROOT_PATH" ] && [ -f "$SUPERSET_ROOT_PATH/.env" ]; then
  set -a
  source "$SUPERSET_ROOT_PATH/.env"
  set +a
fi

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

# Create .envrc for direnv
if [ ! -f .envrc ]; then
  echo "🔧 Creating .envrc..."
  cat > .envrc << 'ENVRC'
#!/usr/bin/env bash
dotenv .env
ENVRC
  if command -v direnv &> /dev/null; then
    direnv allow
  fi
  success "direnv configured"
fi

# Create or get Neon branch for this workspace
WORKSPACE_NAME="${SUPERSET_WORKSPACE_NAME:-$(basename "$PWD")}"

# Check if branch already exists
EXISTING_BRANCH=$(neonctl branches list --project-id "$NEON_PROJECT_ID" --output json | jq -r ".[] | select(.name == \"$WORKSPACE_NAME\") | .id")

if [ -n "$EXISTING_BRANCH" ]; then
  echo "🗄️  Using existing Neon branch..."
  BRANCH_ID="$EXISTING_BRANCH"
  # Get connection strings for existing branch
  DIRECT_URL=$(neonctl connection-string "$EXISTING_BRANCH" --project-id "$NEON_PROJECT_ID")
  POOLED_URL=$(neonctl connection-string "$EXISTING_BRANCH" --project-id "$NEON_PROJECT_ID" --pooled)
else
  echo "🗄️  Creating Neon branch..."
  NEON_OUTPUT=$(neonctl branches create \
    --project-id "$NEON_PROJECT_ID" \
    --name "$WORKSPACE_NAME" \
    --output json)
  BRANCH_ID=$(echo "$NEON_OUTPUT" | jq -r '.branch.id')
  # Get connection strings for new branch
  DIRECT_URL=$(neonctl connection-string "$BRANCH_ID" --project-id "$NEON_PROJECT_ID")
  POOLED_URL=$(neonctl connection-string "$BRANCH_ID" --project-id "$NEON_PROJECT_ID" --pooled)
fi

# Copy root .env and append branch-specific values
cp "$SUPERSET_ROOT_PATH/.env" .env
cat >> .env << EOF

# Workspace Database (Neon Branch)
NEON_BRANCH_ID=$BRANCH_ID
DATABASE_URL=$POOLED_URL
DATABASE_URL_UNPOOLED=$DIRECT_URL
EOF

success "Neon branch created: $WORKSPACE_NAME"
echo "✨ Done!"
