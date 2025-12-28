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
command -v docker &> /dev/null || error "Docker not installed. Install from https://docker.com"

# Check required environment variables
NEON_PROJECT_ID="${NEON_PROJECT_ID:-}"
[ -z "$NEON_PROJECT_ID" ] && error "NEON_PROJECT_ID environment variable is required"

# Install dependencies
echo "📥 Installing dependencies..."
bun install
success "Dependencies installed"

# Create or get Neon branch for this workspace
WORKSPACE_NAME="${SUPERSET_WORKSPACE_NAME:-$(basename "$PWD")}"

# Check if branch already exists
EXISTING_BRANCH=$(neonctl branches list --project-id "$NEON_PROJECT_ID" --output json | jq -r ".[] | select(.name == \"$WORKSPACE_NAME\") | .id")

if [ -n "$EXISTING_BRANCH" ]; then
  echo "🗄️  Using existing Neon branch..."
  BRANCH_ID="$EXISTING_BRANCH"
  # Get connection strings for existing branch
  DIRECT_URL=$(neonctl connection-string "$EXISTING_BRANCH" --project-id "$NEON_PROJECT_ID" --role-name neondb_owner)
  POOLED_URL=$(neonctl connection-string "$EXISTING_BRANCH" --project-id "$NEON_PROJECT_ID" --role-name neondb_owner --pooled)
else
  echo "🗄️  Creating Neon branch..."
  NEON_OUTPUT=$(neonctl branches create \
    --project-id "$NEON_PROJECT_ID" \
    --name "$WORKSPACE_NAME" \
    --output json)
  BRANCH_ID=$(echo "$NEON_OUTPUT" | jq -r '.branch.id')
  # Get connection strings for new branch
  DIRECT_URL=$(neonctl connection-string "$BRANCH_ID" --project-id "$NEON_PROJECT_ID" --role-name neondb_owner)
  POOLED_URL=$(neonctl connection-string "$BRANCH_ID" --project-id "$NEON_PROJECT_ID" --role-name neondb_owner --pooled)
fi

success "Neon branch ready: $WORKSPACE_NAME"

# Start Electric SQL container
ELECTRIC_CONTAINER="superset-electric-$WORKSPACE_NAME"
ELECTRIC_SECRET="${ELECTRIC_SECRET:-local_electric_dev_secret}"

echo "⚡ Starting Electric SQL container..."

# Stop and remove existing container if it exists
if docker ps -a --format '{{.Names}}' | grep -q "^${ELECTRIC_CONTAINER}$"; then
  docker stop "$ELECTRIC_CONTAINER" &> /dev/null || true
  docker rm "$ELECTRIC_CONTAINER" &> /dev/null || true
fi

# Start Electric container with auto-assigned port
docker run -d \
  --name "$ELECTRIC_CONTAINER" \
  -p 3000 \
  -e DATABASE_URL="$DIRECT_URL" \
  -e ELECTRIC_SECRET="$ELECTRIC_SECRET" \
  electricsql/electric:latest

# Get the auto-assigned port
ELECTRIC_PORT=$(docker port "$ELECTRIC_CONTAINER" 3000 | cut -d: -f2)

# Wait for Electric to be ready
echo "⏳ Waiting for Electric to be ready on port $ELECTRIC_PORT..."
for i in {1..30}; do
  if curl -s "http://localhost:$ELECTRIC_PORT/v1/health" &> /dev/null; then
    success "Electric SQL running on port $ELECTRIC_PORT"
    break
  fi
  if [ $i -eq 30 ]; then
    error "Electric failed to start. Check logs: docker logs $ELECTRIC_CONTAINER"
  fi
  sleep 1
done

ELECTRIC_URL="http://localhost:$ELECTRIC_PORT/v1/shape"
success "Electric SQL ready at $ELECTRIC_URL"

# Copy root .env and append workspace-specific values
echo "📝 Writing .env file..."
cp "$SUPERSET_ROOT_PATH/.env" .env
cat >> .env << EOF

# Workspace Database (Neon Branch)
NEON_BRANCH_ID=$BRANCH_ID
DATABASE_URL=$POOLED_URL
DATABASE_URL_UNPOOLED=$DIRECT_URL

# Workspace Electric SQL (Docker)
ELECTRIC_CONTAINER=$ELECTRIC_CONTAINER
ELECTRIC_PORT=$ELECTRIC_PORT
ELECTRIC_URL=$ELECTRIC_URL
ELECTRIC_SECRET=$ELECTRIC_SECRET
EOF

success "Workspace .env written"
echo "✨ Done!"
