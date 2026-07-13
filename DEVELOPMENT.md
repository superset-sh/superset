# Developing Superset

This guide is for contributors building Superset from source. If you just want to use Superset, [download the macOS app](https://github.com/superset-sh/superset/releases/latest) instead.

## Prerequisites

| Tool | Install |
|:-----|:--------|
| [Bun](https://bun.sh/) (v1.0+) | `curl -fsSL https://bun.sh/install \| bash` |
| [Docker](https://docs.docker.com/get-docker/) | Docker Desktop or OrbStack |
| `jq` | `brew install jq` |
| [Caddy](https://caddyserver.com/docs/install) | `brew install caddy && caddy trust` |
| Git 2.20+ and [`gh`](https://cli.github.com/) | `brew install gh` |

macOS is the primary supported platform. Windows / Linux are untested.

## Run it (one command)

```bash
git clone https://github.com/superset-sh/superset.git
cd superset
./.superset/setup.local.sh
bun run dev
```

That's it. **You do not need a Neon account, Stripe keys, or any other third-party credentials.** `.env.local.example` ships fake placeholders that pass env validation, and `setup.local.sh` runs everything against a local Docker stack.

### What `setup.local.sh` does

1. Copies `.env.local.example` → `.env`
2. Allocates a per-workspace port range so multiple worktrees don't collide
3. Brings up Postgres + neon-proxy + Electric + Redis (behind an HTTP shim, for the relay) via `docker compose` (project-scoped to this worktree)
4. Runs `bun install` and `bun run db:migrate`
5. Seeds a `Local Admin` dev account via `bun run db:seed-dev`
6. Writes a gitignored `.superset/config.local.json` overlay so subsequent worktrees automatically use this setup

Re-run the script any time to refresh the workspace. To tear the local DB stack down:

```bash
./.superset/teardown.local.sh
```

### Signing in

After `bun run dev`, open the web app and click the **"Sign in as dev"** button on the sign-in page (also available in the desktop sign-in screen). Or use the credentials directly:

- Email: `admin@local.test`
- Password: `supersetdev`

The dev sign-in button and email/password auth are gated on `NODE_ENV=development`. They don't ship in production.

## Manual setup (advanced)

If you need to point at real Neon / third-party services instead of the local Docker stack:

```bash
cp .env.example .env             # fill in real Neon, Stripe, etc. credentials
cp Caddyfile.example Caddyfile   # HTTPS reverse proxy for Electric streams
bun install
bun run dev
```

## Building the desktop app

```bash
bun run build
open apps/desktop/release
```

## Common commands

```bash
bun dev                # Start all dev servers
bun test               # Run tests
bun run lint:fix       # Fix lint + format
bun run typecheck      # Type-check all packages
bun run build          # Build all packages
```

See [`AGENTS.md`](./AGENTS.md) for repo structure, monorepo conventions, and database/migration workflow.

## Troubleshooting

- **`caddy trust` prompts for sudo**: expected, once per machine. Without it Chromium rejects `https://localhost:*` with `ERR_CERT_AUTHORITY_INVALID`.
- **Port collision**: `setup.local.sh` allocates a fresh port window per worktree. If you ran the script before this change landed, re-run it to migrate.
- **DB connection errors after pulling main**: re-run `./.superset/setup.local.sh`; it's idempotent and will apply any new migrations.
- **Stuck Docker stack**: `./.superset/teardown.local.sh` then re-run setup.

## Contributing

See [`CONTRIBUTING.md`](./CONTRIBUTING.md) for the PR process and code-of-conduct expectations.
