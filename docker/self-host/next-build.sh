#!/bin/sh
set -eu

app=${1:?Application is required}
workspace=${2:?Workspace root is required}
release=${3:?Release directory is required}
case "$app" in
  api|web|docs) ;;
  *) echo 'Application must be api, web or docs' >&2; exit 1 ;;
esac

: "${NEXT_PUBLIC_API_URL:?Public API URL is required at build time}"
: "${NEXT_PUBLIC_MARKETING_URL:?Public marketing URL is required at build time}"
if [ "$app" = docs ]; then
  : "${NEXT_PUBLIC_DOCS_URL:?Public docs URL is required at build time}"
else
  : "${NEXT_PUBLIC_WEB_URL:?Public web URL is required at build time}"
  : "${NEXT_PUBLIC_ADMIN_URL:?Public admin URL is required at build time}"
  if [ "$app" = web ]; then
    : "${NEXT_PUBLIC_DOCS_URL:?Public docs URL is required at build time}"
    : "${NEXT_PUBLIC_RELAY_URL:?Public relay URL is required at build time}"
    : "${NEXT_PUBLIC_REALTIME_URL:?Public realtime URL is required at build time}"
    : "${RELAY_URL:?Relay CSP origin is required at build time}"
    : "${RELAY_BACKUP_URL:?Backup relay CSP origin is required at build time}"
    : "${REALTIME_URL:?Realtime CSP origin is required at build time}"
    : "${USERCONTENT_URL:?User content CSP origin is required at build time}"
  fi
fi
[ ! -e "$release" ] || { echo 'Release directory already exists' >&2; exit 1; }

cd "$workspace"
if [ "$app" = docs ]; then
  NEXT_OUTPUT_STANDALONE=1 SKIP_ENV_VALIDATION=1 NODE_ENV=production \
    bun x --no-install turbo run build --filter="@superset/$app" --env-mode=loose
else
  NEXT_OUTPUT_STANDALONE=1 SKIP_ENV_VALIDATION=1 NODE_ENV=production \
    SELF_HOST_DB=1 SELF_HOST_KV=1 SELF_HOST_QUEUE=1 \
    DATABASE_URL=postgres://build:build@127.0.0.1:5432/build \
    DATABASE_URL_UNPOOLED=postgres://build:build@127.0.0.1:5432/build \
    REDIS_URL=redis://127.0.0.1:6379 KV_URL=redis://127.0.0.1:6379 \
    SELF_HOST_QUEUE_SECRET=build-only-fake-queue-secret-never-for-runtime \
    SMTP_URL=smtp://127.0.0.1:1025 \
    BETTER_AUTH_SECRET=build-only-fake-auth-secret-never-for-runtime \
    SECRETS_ENCRYPTION_KEY=0000000000000000000000000000000000000000000000000000000000000000 \
    STRIPE_SECRET_KEY=sk_test_build_only \
    SERVER_ANTHROPIC_API_KEY=build-only-fake-key \
    GH_CLIENT_ID=build-only GH_CLIENT_SECRET=build-only \
    GOOGLE_CLIENT_ID=build-only GOOGLE_CLIENT_SECRET=build-only \
    GH_APP_ID=1 GH_APP_PRIVATE_KEY=build-only GH_APP_SLUG=build-only \
    GH_WEBHOOK_SECRET=build-only \
    LINEAR_CLIENT_ID=build-only LINEAR_CLIENT_SECRET=build-only LINEAR_WEBHOOK_SECRET=build-only \
    SLACK_CLIENT_ID=build-only SLACK_CLIENT_SECRET=build-only SLACK_SIGNING_SECRET=build-only \
    SLACK_BILLING_WEBHOOK_URL=https://build.invalid \
    bun x --no-install turbo run build --filter="@superset/$app" --env-mode=loose
fi

standalone="apps/$app/.next/standalone"
server="$standalone/apps/$app/server.js"
[ -f "$server" ] && [ ! -L "$server" ] || { echo 'Missing generated standalone server' >&2; exit 1; }
[ -d "apps/$app/.next/static" ] || { echo 'Missing generated static assets' >&2; exit 1; }
if [ "$app" != api ]; then
  [ -d "apps/$app/public" ] || { echo 'Missing public assets' >&2; exit 1; }
fi
mkdir -p "$release"
cp -a "$standalone/." "$release/"
mkdir -p "$release/apps/$app/.next"
cp -a "apps/$app/.next/static" "$release/apps/$app/.next/"
if [ -d "apps/$app/public" ]; then
  cp -a "apps/$app/public" "$release/apps/$app/"
fi
