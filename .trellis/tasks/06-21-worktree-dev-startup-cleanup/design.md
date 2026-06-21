# Design

## Architecture

Add two repo-owned tooling entrypoints:

- `.superset/worktree-dev.sh` owns the worktree-local service lifecycle. It is a
  shell script because the existing setup/teardown stack is shell-based and
  already owns port allocation, Docker compose naming, and `.env` conventions.
- `scripts/e2e-workspace-fixture.ts` owns database fixture rows. It is a Bun
  TypeScript script so it can reuse the repo's Drizzle schema/client and avoid
  ad hoc SQL where possible.

Root `package.json` exposes both through memorable scripts:

- `dev:worktree:start`
- `dev:worktree:status`
- `dev:worktree:stop`
- `dev:worktree:cleanup`
- `e2e:workspace-fixture`

## Worktree Lifecycle

`worktree-dev.sh` loads `.env`, derives:

- `SUPERSET_WORKSPACE_NAME`
- `SUPERSET_HOME_DIR`
- app ports (`API_PORT`, `RELAY_PORT`, `WRANGLER_PORT`, `DESKTOP_VITE_PORT`)
- Docker ports (`LOCAL_*`)
- Docker compose project name using the same sanitizer as
  `.superset/setup.local.sh`

It starts long-running app services in a per-worktree tmux socket under
`.tmp/worktree-dev/tmux.sock`:

- API: `apps/api` Next dev on `API_PORT`
- Relay: `apps/relay` Bun hot server
- Electric proxy: `apps/electric-proxy` Wrangler on `WRANGLER_PORT`
- Desktop: `apps/desktop` Electron dev with `DESKTOP_AUTOMATION_PORT`

Readiness checks probe real contracts, not just process existence:

- Neon proxy can execute `select 1`.
- API session endpoint responds with HTTP 200.
- Relay `/health` responds with HTTP 200.
- Electric proxy `/v1/shape` responds with HTTP 401.
- Desktop Automation `window-info --json` succeeds.

## Fixture Helper

`e2e-workspace-fixture.ts` supports:

- `seed --slug --name --repo-url [--id] [--email]`
- `cleanup --slug <slug>` / `cleanup --id <id>`

It resolves the dev account organization from `admin@local.test` by default,
then upserts/deletes `v2_projects` and dependent `v2_workspaces`. It refuses
database URLs that look like production unless `--allow-production` is passed.
The helper prints JSON so automation can consume project ids without parsing
human text.

## Cleanup

`worktree-dev.sh cleanup` composes:

- stop app services
- stop Docker compose project
- optional fixture cleanup calls for supplied `--e2e-slug` or `--e2e-id`
- optional local directory removal under `${SUPERSET_HOME_DIR}` and
  `$HOME/.superset/worktrees` for supplied slugs/ids

Cleanup is worktree-local by default and does not target the primary app's
online database.

## Trade-offs

- tmux is required for long-running one-command startup. This mirrors
  `scripts/superset-online.sh`; the setup script can still be used without tmux.
- The fixture helper is general enough for main/local DBs, but production-like
  database targets are blocked by default to avoid accidental real data changes.
- Full Desktop E2E abstraction is intentionally deferred; the immediate win is
  removing service and fixture ceremony before the existing automation begins.
