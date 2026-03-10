#!/bin/bash
# ============================================
# Supabase 초기 설정 스크립트
# ============================================
# DB reset 또는 새 인스턴스 세팅 시 실행:
#   cd packages/drizzle && bash supabase/setup.sh
#
# .env.local에서 DATABASE_URL을 읽어 사용합니다.
# ============================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/../../.." && pwd)"

# .env.local에서 DATABASE_URL 읽기
if [ -f "$ROOT_DIR/.env.local" ]; then
  DATABASE_URL=$(grep '^DATABASE_URL=' "$ROOT_DIR/.env.local" | sed 's/^DATABASE_URL=//' | tr -d '"')
else
  echo "Error: .env.local not found at $ROOT_DIR/.env.local"
  exit 1
fi

if [ -z "$DATABASE_URL" ]; then
  echo "Error: DATABASE_URL not set in .env.local"
  exit 1
fi

echo "=== Supabase Setup ==="
echo "DB: $DATABASE_URL"
echo ""

# 1. Auth Trigger
echo "[1/2] Applying auth-trigger.sql..."
psql "$DATABASE_URL" -f "$SCRIPT_DIR/auth-trigger.sql" 2>&1 || echo "  Warning: Some auth-trigger statements may have already been applied"

# 2. Storage Buckets
echo "[2/2] Applying storage-buckets.sql..."
psql "$DATABASE_URL" -f "$SCRIPT_DIR/storage-buckets.sql" 2>&1 || echo "  Warning: Some storage-bucket statements may have already been applied"

echo ""
echo "=== Setup Complete ==="
