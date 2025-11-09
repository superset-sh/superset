#!/usr/bin/env bash
set -e

echo "🚀 Setting up Superset workspace..."

# Install dependencies
echo "📥 Installing dependencies..."
bun install

# Link direnv config
echo "🔧 Linking .envrc..."
ln -sf "$CONDUCTOR_ROOT_PATH/.envrc" .envrc

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

echo "✨ Done! Neon branch: $WORKSPACE_NAME"
