# Local Development

How to run Superset locally from a fresh clone, with no Neon / OAuth / Stripe / Resend keys required. The dev path auto-creates a local admin user, runs Postgres in Docker, and signs you in before the desktop window opens.

## Prerequisites

- [Bun](https://bun.sh) 1.3+
- Docker (for Postgres and Electric SQL)
- [Caddy](https://caddyserver.com/docs/install) (for HTTPS proxy)
- macOS or Linux

## One-time setup

```bash
git clone https://github.com/superset-sh/superset.git
cd superset
bun install
```

**1. Start Postgres**

```bash
docker run -d --name superset-pg \
  -e POSTGRES_USER=superset \
  -e POSTGRES_PASSWORD=superset \
  -e POSTGRES_DB=superset \
  -p 5433:5432 \
  postgres:16 -c wal_level=logical
```

Port `5433` avoids clobbering a host Postgres on the default `5432`. `wal_level=logical` is required for Electric SQL replication.

**2. Create your `.env`**

```bash
cp .env.example .env
```

Then edit `.env` so it has at minimum:

```bash
DATABASE_URL=postgres://superset:superset@localhost:5433/superset
DATABASE_URL_UNPOOLED=postgres://superset:superset@localhost:5433/superset
BETTER_AUTH_SECRET=dev_secret_$(openssl rand -hex 24)
```

Everything else can stay blank. The app degrades cleanly when integration keys (Stripe, Resend, GitHub App, etc.) are missing — features that need them will throw a clean "X not configured" error when you actually exercise them; nothing crashes at boot.

**3. Apply the schema**

```bash
bun run db:migrate
```

This creates the `auth` and `public` schemas and runs all Drizzle migrations. ~42 tables.

**4. Set up Caddy (HTTPS proxy)**

```bash
cp Caddyfile.example Caddyfile
caddy trust   # one-time, prompts for sudo
```

Without `caddy trust`, Chromium will reject `https://localhost:*` with `ERR_CERT_AUTHORITY_INVALID`.

## Run it

```bash
SKIP_ENV_VALIDATION=1 bun dev
```

That brings up:

| Service | Port | What it does |
|---|---|---|
| Web | 4640 | Marketing-style sign-in page |
| API | 4641 | Backend (Next.js) |
| Desktop (Vite) | 4645 | Renderer dev server |
| Notifications | 4646 | Desktop notification bridge |
| Electric SQL | 4649 | Sync layer (Docker) |
| Caddy | 4650 | HTTPS proxy in front of electric-proxy |
| electric-proxy | 4652 | Cloudflare worker (Wrangler) |

The Electron window opens automatically.

### How sign-in works

On first launch in dev mode (`SKIP_ENV_VALIDATION=1`), the desktop main process auto-signs you in as a seed admin user:

- **Email:** `admin@local.test`
- **Password:** `supersetdev`

If the user doesn't exist, it's created and a personal organization is provisioned automatically (`Local Admin's Team`). The encrypted auth token lands in `superset-dev-data/auth-token.enc`. The renderer hydrates this token like a real OAuth user — there's no special dev-only code path in the renderer.

For the web app (`http://localhost:4640`), the sign-in and sign-up pages render a dev-only email/password form when `NODE_ENV !== "production"`. Use the same credentials.

## Why `SKIP_ENV_VALIDATION=1`?

`apps/api/src/env.ts` currently declares many integration keys (`STRIPE_*`, `RESEND_API_KEY`, `GH_APP_*`, etc.) as required strings via `@t3-oss/env-nextjs`. Until those are marked optional, the env validator rejects empty values at boot. `SKIP_ENV_VALIDATION=1` is the upstream escape hatch — propagated via `turbo.jsonc`'s `globalPassThroughEnv` so it reaches every subtask.

## What works in OSS mode

✓ Sign-in (email/password)
✓ Database (Postgres + Drizzle)
✓ Electric SQL sync
✓ Host service (local git/worktree operations)
✓ Create workspaces, run terminals, edit files
✓ tRPC / API routing

## What's stubbed (won't fully work without keys)

- **Billing** — Stripe lazy-throws if exercised. Subscriptions/checkout disabled.
- **Email send** — Resend lazy-throws. Magic-link / password reset emails are stubbed.
- **Telemetry** — PostHog initializes only when key present; calls are no-ops otherwise.
- **Error tracking** — Sentry initializes only when DSN present.
- **OAuth (Google, GitHub)** — providers register only when their `*_CLIENT_ID` is set.
- **GitHub App / Linear / Slack** — webhooks and integrations no-op without their keys.
- **QStash background jobs** — no key → no scheduled jobs fire.
- **Upstash KV rate limiting** — falls back gracefully.

Each is "guard, don't crash" — if you click into a feature that needs a key, you'll see a `503` or a clean exception, not a boot failure.

## Troubleshooting

**`EADDRINUSE: address already in use :::4641`** — a previous `bun dev` is still alive. `pkill -f "turbo run dev"` and retry.

**`Host service not available` toast in desktop** — the auto-sign-in didn't run or didn't persist the token. Check `superset-dev-data/auth-token.enc` exists. Delete it and rerun if needed: `rm superset-dev-data/auth-token.enc && SKIP_ENV_VALIDATION=1 bun dev`.

**`Missing API key` for some integration** — that integration's key isn't in `.env`. Either supply it or avoid the feature.

**Electric SQL container fails to start replication** — verify `wal_level=logical` on your Postgres: `docker exec superset-pg psql -U superset -d superset -c "SHOW wal_level"` should return `logical`.

**`schema "auth" already exists` during `db:migrate`** — drop and re-migrate: `docker exec superset-pg psql -U superset -d superset -c "DROP SCHEMA auth CASCADE"` then `bun run db:migrate`.

## Resetting state

```bash
# Stop dev
pkill -f "turbo run dev"

# Wipe data (auth token, host DBs, local app state)
rm -rf superset-dev-data

# Wipe Postgres
docker rm -f superset-pg
# then re-run the docker run from step 1
```

## Architecture notes for contributors

- **DB driver swap** — `packages/db/src/client.ts` detects whether `DATABASE_URL` is a Neon host (`*.neon.tech`, `*.neon.build`) and uses Drizzle's `neon-http` adapter for cloud, or `node-postgres` for any other Postgres (including the local Docker one).
- **Dev auto-sign-in** — `apps/desktop/src/main/lib/dev-auto-sign-in.ts` runs once during `app.whenReady()`. POSTs to `/api/auth/sign-in/email` (auto-signs-up if user doesn't exist), persists the token via the same `saveToken()` that OAuth uses. The renderer doesn't know dev mode exists.
- **Renderer organization selection** — pages prefer `session.activeOrganizationId` from Better Auth, falling back to `MOCK_ORG_ID` only if there's no session at all. Make sure new code that needs `activeOrganizationId` follows this same priority (real session first).
- **CDP for headless tests** — when `SKIP_ENV_VALIDATION=1`, the desktop main process exposes Chrome DevTools Protocol on `localhost:9333`. Useful for scripted UI checks (`curl http://localhost:9333/json/list`).
