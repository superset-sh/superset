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
SUPERSET_OSS=1 bun dev
```

`SUPERSET_OSS=1` opts you into the lenient OSS profile so the app boots without every integration key — Stripe, OAuth, Resend, etc. become optional. Without it, the app defaults to strict validation (matching the internal-team workflow) and will fail boot if any of those keys are missing.

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

On first launch in the `oss-dev` profile (when `SUPERSET_OSS=1` is set), the desktop main process auto-signs you in as a seed admin user:

- **Email:** `admin@local.test`
- **Password:** `supersetdev`

If the user doesn't exist, it's created and a personal organization is provisioned automatically (`Local Admin's Team`). The encrypted auth token lands in `superset-dev-data/auth-token.enc`. The renderer hydrates this token like a real OAuth user — there's no special dev-only code path in the renderer.

### Deployment profiles

Profile is resolved at boot:

| Profile     | Trigger                              | Behavior |
|-------------|--------------------------------------|----------|
| `cloud`     | `VERCEL=1` (set automatically)       | Strict — every integration key required |
| `oss-dev`   | `SUPERSET_OSS=1`                     | Lenient — integration keys optional, features degrade |
| `internal`  | default                              | Strict — covers internal team dev and self-hosted prod |

**Strict-by-default is the safe direction.** Internal devs and self-hosters keep their fail-fast workflow with no setup changes. OSS contributors set `SUPERSET_OSS=1` once (in `.env`, or as a shell var) to opt into the lenient path.

The escape hatch `SKIP_ENV_VALIDATION=1` still works for build-time / CI cases (e.g. Docker preview builds).

### Boot summary + `/api/health`

When the API boots in `oss-dev`, it prints a one-time summary of what's disabled:

```
[superset] profile=oss-dev (lenient)
[superset] disabled features (set the listed env var to enable):
           - stripe                       STRIPE_SECRET_KEY
           - resend (email)               RESEND_API_KEY
           - posthog (telemetry)          NEXT_PUBLIC_POSTHOG_KEY
           ...
```

For programmatic monitoring (or to confirm a key took effect), hit `GET /api/health`:

```json
{ "ok": true, "profile": "oss-dev", "integrations": { "stripe": "missing", ... } }
```

For the web app (`http://localhost:4640`), the sign-in and sign-up pages render a dev-only email/password form when `NODE_ENV !== "production"`. Use the same credentials.

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

**`Host service not available` toast in desktop** — the auto-sign-in didn't run or didn't persist the token. Check `superset-dev-data/auth-token.enc` exists. Delete it and rerun if needed: `rm superset-dev-data/auth-token.enc && SUPERSET_OSS=1 bun dev`. Also confirm the profile via `curl http://localhost:4641/api/health` returns `"profile": "oss-dev"` — if it says `internal`, you forgot to set `SUPERSET_OSS=1` and auto-sign-in is intentionally skipped.

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

- **Deployment profiles** — `packages/shared/src/deployment-profile.ts` resolves `cloud | internal-dev | self-hosted | oss-dev` from env flags. Strict profiles fail boot on missing keys; lenient (`oss-dev`) lets the app boot. Use `isStrictProfile()` from this module when you need to gate dev-only behavior.
- **DB driver swap** — `packages/db/src/client.ts` detects whether `DATABASE_URL` is a Neon host (`*.neon.tech`, `*.neon.build`) and uses Drizzle's `neon-http` adapter for cloud, or `node-postgres` for any other Postgres (including the local Docker one).
- **Dev auto-sign-in** — `apps/desktop/src/main/lib/dev-auto-sign-in.ts` runs once during `app.whenReady()` only in the `oss-dev` profile. POSTs to `/api/auth/sign-in/email` (auto-signs-up if user doesn't exist), persists the token via the same `saveToken()` that OAuth uses. The renderer doesn't know dev mode exists.
- **Renderer organization selection** — pages prefer `session.activeOrganizationId` from Better Auth, falling back to `MOCK_ORG_ID` only if there's no session at all. Make sure new code that needs `activeOrganizationId` follows this same priority (real session first).
- **CDP for headless tests** — in the `oss-dev` profile, the desktop main process exposes Chrome DevTools Protocol on `localhost:9333`. Useful for scripted UI checks (`curl http://localhost:9333/json/list`).
