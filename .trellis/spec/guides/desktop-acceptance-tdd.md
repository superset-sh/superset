# Desktop Acceptance TDD

Use this guide when a task changes desktop user-visible behavior, authenticated entry, routing, workspace/task/agent flows, terminal or host runtime behavior, or any Electron main/preload/renderer boundary.

## Default Expectation

Desktop-facing requirements should define acceptance before implementation:

- Write the user-visible acceptance path in `prd.md`.
- Write the automation strategy in `design.md` or `implement.md`.
- Prefer adding the failing unit/source/integration check before changing behavior when the regression can be expressed cheaply.
- Use the project Desktop Automation CLI as the default real desktop acceptance tool when correctness depends on Electron startup, preload IPC, token persistence, route guards, host-service startup, terminal/websocket runtime, or multi-pane UI.
- Capture screenshots for smoke checkpoints and failures.

If a desktop-facing task does not run Desktop Automation CLI acceptance, the task's validation notes must explain why the risk is adequately covered by lower-level tests.

## Acceptance Pyramid

Use the cheapest reliable layer first, then add the real app layer when the behavior crosses runtime boundaries.

1. Unit or source regression tests for pure helpers, route wiring, guards, deleted code staying deleted, and fragile import boundaries.
2. Integration tests for tRPC routers, host-service, pty-daemon, database contracts, and process/session adoption.
3. Desktop Automation CLI acceptance for flows that only prove out when Electron main, preload, renderer, persisted state, and backend services run together.
4. Visual screenshot review for layout, blank-screen, wrong-surface, modal, or obvious product-state regressions.

Do not replace lower-level deterministic assertions with screenshot-only checks. Screenshots are evidence and debugging artifacts; selectors, URL/hash state, files, logs, and service probes are the primary gates.

## Desktop Automation CLI Quality Gate

The default tool for real desktop acceptance is `packages/desktop-mcp`, run through the repo-local `desktop:automation` Bun script.

Trellis quality gates are repo-local workflow steps and executable commands, not MCP plug-in slots. Use `bun run desktop:automation -- ...` in validation steps and slash commands so the gate does not depend on whether the current host exposes local MCP tools to the model. The MCP server can remain available as a compatibility surface, but Trellis gates should prefer the CLI.

Use it like this:

- Start the real desktop app with `bun run --cwd apps/desktop dev`; the script sets `DESKTOP_AUTOMATION_PORT=9322`.
- Use Desktop Automation CLI commands to inspect and drive the app: `window-info`, `inspect-dom`, `wait-for`, `click`, `type-text`, `send-keys`, `navigate`, `console-logs`, `evaluate-js`, and `screenshot`.
- Prefer `smoke` for Trellis gates, for example `bun run desktop:automation -- smoke --url-includes "#/sign-in" --screenshot .trellis/tasks/<task>/artifacts/01-sign-in.png --report .trellis/tasks/<task>/artifacts/01-sign-in.json`.
- Save screenshot artifacts under the task directory, for example `.trellis/tasks/<task>/artifacts/01-sign-in.png`.
- Record any CLI failures, console errors, report paths, and screenshot paths in validation notes.
- If Desktop Automation cannot control an OS-level surface, use Codex Desktop Computer Use as a fallback and record why the fallback was needed.

Do not add Playwright, WebDriver, or another desktop driver for routine Trellis acceptance unless a specific task needs CI-style fully scripted execution that Desktop Automation cannot provide.

## Local Desktop Startup Contract

Use this contract before any desktop-facing Trellis acceptance run in a Superset git worktree. The desktop app is not a single process in development; V2 auth, live workspace data, relay, Electric, host-service panes, and Desktop Automation only work when the worktree-local service graph is up.

### 1. Scope / Trigger

- Trigger: validating the real Electron desktop app, authenticated V2 dashboard, workspace chat/code panes, host-service features, Electric/TanStack DB collections, or Desktop Automation CLI acceptance.
- Goal: use the worktree lifecycle command as the default startup, status, and cleanup path so every worktree gets isolated ports, an isolated Docker compose project, an isolated desktop profile, and deterministic readiness probes before running `bun run desktop:automation -- ...`.
- Only drop to manual service commands when debugging why the lifecycle command failed.

### 2. Signatures

- Worktree startup: `bun run dev:worktree:start`
- Readiness/status report: `bun run dev:worktree:status`
- Stop app and data services: `bun run dev:worktree:stop`
- Cleanup app/data services, seeded fixture rows, and local clone/worktree directories: `bun run dev:worktree:cleanup -- --e2e-slug <slug> [--worktree-name <dir-name>]`
- Fixture seed for desktop E2E: `bun run e2e:workspace-fixture -- seed --slug <slug> --name <name> --repo-url <url> [--id <uuid>] [--email <email>]`
- Fixture cleanup without stopping services: `bun run e2e:workspace-fixture -- cleanup --slug <slug>`
- Desktop Automation command against the worktree CDP port: `DESKTOP_AUTOMATION_PORT=<port> bun run desktop:automation -- <command> ...`
- Manual graph for debugging lifecycle failures:
  - Docker service graph: `COMPOSE_PROJECT_NAME=<LOCAL_DB_PROJECT> docker compose -p <LOCAL_DB_PROJECT> up -d postgres neon-proxy electric redis kv-rest`
  - API: `bun run --cwd apps/api dev`
  - Relay: `bun --cwd apps/relay --hot src/index.ts`
  - Electric proxy Worker: `bun run --cwd apps/electric-proxy dev`
  - Desktop/Electron: `bun run --cwd apps/desktop dev`
- Automation probe: `DESKTOP_AUTOMATION_PORT=<port> bun run desktop:automation -- window-info --json`
- Renderer env probe: `bun run desktop:automation -- evaluate-js --code "JSON.stringify({ electricUrl: process.env.NEXT_PUBLIC_ELECTRIC_URL, href: location.href })" --json`

### 3. Contracts

- `.superset/setup.local.sh` writes worktree-local `.env` values and `.superset/config.local.json`. If `.env` is missing the managed local values, `bun run dev:worktree:start` runs setup first.
- The managed `.env` block must include `SUPERSET_WORKTREE_ID` and `SUPERSET_WORKTREE_ROOT` for the current physical worktree path. Do not treat `SUPERSET_HOME_DIR` alone as proof that the file is safe for this worktree.
- `SUPERSET_PORT_BASE` owns the per-worktree port family. Default derived ports are: API `${base + 1}`, desktop Vite `${base + 5}`, raw Electric `${base + 9}`, Wrangler/Electric proxy `${base + 12}`, relay `${base + 13}`, Postgres `${base + 14}`, Neon HTTP proxy `${base + 15}`, Redis `${base + 16}`, KV REST `${base + 17}`, and Desktop Automation/CDP `${base + 18}`.
- `LOCAL_DB_PROJECT` is the Docker compose project name. It must be unique per worktree, include the current `SUPERSET_WORKTREE_ID`, and be used with `docker compose -p "$LOCAL_DB_PROJECT"` so worktrees do not share containers or ports. Never derive it from only `basename "$PWD"` because Codex worktrees usually end in the same `superset` directory name.
- `SUPERSET_HOME_DIR` must point at a disposable worktree-local profile, normally `<repo>/superset-dev-data`, so E2E does not touch the developer's daily desktop profile.
- `bun run dev:worktree:start` starts Docker data services (`postgres`, `neon-proxy`, `electric`, `redis`, `kv-rest`), runs `db:migrate`, runs `db:seed-dev`, prepares desktop predev state, and starts `api`, `relay`, `electric-proxy`, and `desktop` in tmux sessions.
- Before migrations, seed, app service startup, stop, or cleanup, worktree lifecycle commands must reject stale `.env` values that do not point at the current worktree id/root or that point critical service URLs outside localhost/127.0.0.1 on the allocated local ports.
- Worktree tmux state lives under `.tmp/worktree-dev/`, with socket `.tmp/worktree-dev/tmux.sock` and logs `.tmp/worktree-dev/logs/<service>.log`.
- API runs on `API_PORT` and is required for email/password login, registration, organization/project/workspace writes, and auth/session checks.
- `apps/electric-proxy` runs on `WRANGLER_PORT` and is the auth-aware Electric proxy used by V2 collections.
- `NEXT_PUBLIC_ELECTRIC_URL` must point at the reachable auth-aware Electric proxy, not raw Electric. In worktree development, prefer `http://localhost:${WRANGLER_PORT}` so Caddy is not a startup prerequisite.
- `ELECTRIC_URL` is for server/Worker access to raw Electric shape endpoints; renderer code should not use it directly.
- `apps/desktop/electron.vite.config.ts` loads root `.env` with `override: true`. Inline shell overrides such as `NEXT_PUBLIC_ELECTRIC_URL=... bun run --cwd apps/desktop dev` will not beat root `.env`; edit `.env` and restart desktop when changing renderer compile-time env.
- `e2e:workspace-fixture` may only touch local database hosts by default (`localhost`, `127.0.0.1`, `::1`, or `db.localtest.me`). Use `--allow-remote` only for a disposable non-production test database.
- `dev:worktree:cleanup` stops tmux services, tears down the worktree Docker compose project, removes fixture DB rows for supplied slugs/ids, and removes matching clone/worktree directories under `$HOME/.superset/worktrees`, `$SUPERSET_HOME_DIR/worktrees`, `$SUPERSET_HOME_DIR/repos`, and `$SUPERSET_HOME_DIR/clones`.

### 4. Validation & Error Matrix

- Docker/OrbStack is not ready -> `dev:worktree:start` waits, then fails before migrations; start Docker/OrbStack and rerun the command.
- Managed `.env` block is missing, has a stale `SUPERSET_WORKTREE_ID`, has a stale `SUPERSET_WORKTREE_ROOT`, or has a `LOCAL_DB_PROJECT` without the current id -> `dev:worktree:start` must rerun `.superset/setup.local.sh` before running migrations or app services.
- Critical local URLs point at non-local hosts or ports that do not match the managed local allocation -> `dev:worktree:start` must rerun setup, and destructive commands such as `stop`, `cleanup`, or `run-service` must refuse to continue.
- Docker DB stack is down -> API auth and DB-backed workspace writes fail; use `bun run dev:worktree:start` or inspect `bun run dev:worktree:status`.
- Neon proxy cannot execute SQL -> migrations/seeding or fixture helpers are unsafe; fix `LOCAL_NEON_PROXY_PORT`, `DATABASE_URL`, or the Docker compose project before E2E.
- API is down -> login/register blocks or renderer calls to `NEXT_PUBLIC_API_URL` fail; inspect `.tmp/worktree-dev/logs/api.log`.
- Relay is down -> workspace runtime/tunnel flows fail; inspect `.tmp/worktree-dev/logs/relay.log`.
- Electric proxy is down or `NEXT_PUBLIC_ELECTRIC_URL` is stale -> V2 collection-backed workspace/sidebar data can appear empty even when DB rows exist; inspect `.tmp/worktree-dev/logs/electric-proxy.log`, update `.env`, and restart desktop.
- Desktop tmux session exits before CDP is ready -> `dev:worktree:start` fails; inspect `.tmp/worktree-dev/logs/desktop.log`.
- Desktop Automation uses the wrong port -> CLI cannot see the worktree app or controls another app; export `DESKTOP_AUTOMATION_PORT` from `.env` or prefix the command.
- Caddy is missing -> worktree lifecycle should still use direct Wrangler `NEXT_PUBLIC_ELECTRIC_URL=http://localhost:${WRANGLER_PORT}`. Do not make Caddy a required E2E dependency.
- Renderer points at raw Electric (`LOCAL_ELECTRIC_PORT`/`ELECTRIC_URL`) -> shape requests bypass proxy auth and can be rejected; point renderer at `apps/electric-proxy` or Caddy.
- `.env` changes are made after desktop starts -> renderer still uses the old compiled env; restart `apps/desktop`.
- Fixture helper refuses `DATABASE_URL` -> the DB host is not local; do not pass `--allow-remote` unless the target is a disposable non-production test database.
- E2E creates clone/worktree directories -> run `bun run dev:worktree:cleanup -- --e2e-slug <slug> --worktree-name <name>` before handing back.

### 5. Good/Base/Bad Cases

- Good: run `bun run dev:worktree:start`, confirm `bun run dev:worktree:status`, seed any E2E fixture with `bun run e2e:workspace-fixture -- seed ...`, run Desktop Automation smoke with the worktree `DESKTOP_AUTOMATION_PORT`, then run `bun run dev:worktree:cleanup -- --e2e-slug <slug> --worktree-name <name>`.
- Base: when `dev:worktree:start` fails, debug the failing service manually using the same `.env`, `LOCAL_DB_PROJECT`, tmux logs, and readiness probes, then update the lifecycle script/spec if the manual fix reveals a missing contract.
- Bad: only running `bun run --cwd apps/desktop dev`, relying on an existing Electron window, using the default CDP port from another worktree, or manually killing processes without fixture and clone cleanup.

### 6. Tests Required

- Probe the service graph before desktop acceptance with `bun run dev:worktree:status`: Neon proxy SQL query, API session endpoint, relay health endpoint, Electric proxy auth gate, and Desktop Automation `window-info`.
- For V2 workspace tasks, assert route/hash state and at least one collection-backed UI state with `wait-for`, `inspect-dom`, or `evaluate-js`.
- Capture a screenshot and renderer console errors for any desktop smoke run.
- For clone/workspace E2E, seed fixtures with a unique slug, assert the fixture row appears in the UI before creating a clone/workspace, and clean by slug/id after the run.
- After cleanup, verify no listeners remain on the worktree ports, no `LOCAL_DB_PROJECT` containers remain, and no worktree tmux sessions remain when the task requires full teardown proof.
- Record the startup command, status probes, screenshot/report paths, fixture slug/id, and cleanup result in task validation notes.

### 7. Wrong vs Correct

Wrong:

```bash
bun run --cwd apps/desktop dev
bun run desktop:automation -- smoke --url-includes "#/"
```

This only starts Electron, may use the wrong automation port, and does not prove that DB, API, relay, Electric proxy, or fixture cleanup are correct.

Correct:

```bash
bun run dev:worktree:start
bun run dev:worktree:status
DESKTOP_AUTOMATION_PORT="$(grep '^DESKTOP_AUTOMATION_PORT=' .env | cut -d= -f2)" \
  bun run desktop:automation -- smoke --url-includes "#/" \
  --screenshot .trellis/tasks/<task>/artifacts/desktop-smoke.png \
  --report .trellis/tasks/<task>/artifacts/desktop-smoke.json
bun run dev:worktree:cleanup -- --e2e-slug <slug> --worktree-name <name>
```

Wrong:

```bash
bun run e2e:workspace-fixture -- cleanup --slug clone-progress-test --allow-remote
```

Correct:

```bash
bun run e2e:workspace-fixture -- cleanup --slug clone-progress-test
```

Only pass `--allow-remote` for an explicitly disposable non-production database.

## Real Desktop Acceptance Requirements

Real desktop acceptance should:

- Launch the actual Electron app from repository dev or compiled output.
- Use a disposable `SUPERSET_HOME_DIR` so the user's real token, app state, and window state are untouched.
- Refuse production API, Electric, relay, or database targets by default.
- Probe or start required local services explicitly.
- Assert stable route state, visible UI labels/roles, and persisted artifacts such as `auth-token.enc` when relevant.
- Capture screenshots at meaningful checkpoints and on failure.
- Record main-process and renderer console errors.
- Clean up Electron, child services, ports, temporary directories, and background processes best-effort in `finally`.
- After any E2E smoke that signs into a disposable test account, restore the real desktop app to the developer's daily account before handing the app to the user for manual acceptance. Verify the visible organization/workspace label is no longer the E2E account, and avoid creating extra data in the daily account unless the user explicitly asks.

Computer Use fallback is allowed for native dialogs, app menus, full-screen transitions, OS permission prompts, or focus states outside the renderer/CDP boundary. It should not replace Desktop Automation CLI for normal renderer assertions.

## Non-Brittle Assertion Rules

Prefer stable contracts:

- URLs/hash routes that represent product state.
- Accessibility roles, labels, and visible headings.
- Explicit `data-testid` only when the UI has no semantic selector and the selector represents a stable product concept.
- Files or local state the feature is responsible for creating.
- API or service health probes.

Avoid brittle checks:

- Pixel-perfect full-page screenshots unless the task is specifically visual design QA.
- CSS class names from styling libraries.
- Deep DOM structure paths.
- Arbitrary sleeps without a readiness condition.
- Text that is likely to change for copy-only reasons unless the copy itself is the contract.

## Planning Checklist

For every desktop-facing Trellis task, planning should answer:

- What user path proves the feature works in the real desktop app?
- Which lower-level tests catch cheap regressions?
- Does the task need Desktop Automation CLI acceptance? If yes, which app startup command and CLI path prove it?
- Which CLI commands prove the path, and where should screenshot/report artifacts be saved?
- What screenshots should be captured for visual inspection?
- What services, env vars, accounts, ports, and temp state does the smoke need?
- What makes the smoke safe against production data and the user's real local profile?
- What would make the smoke flaky, and what readiness signal avoids that?
- Does any part require Computer Use fallback because CDP cannot reach it?

## Validation Notes

When finishing a desktop-facing task, record:

- The focused unit/source/integration tests that passed.
- The Desktop Automation CLI acceptance path and result, or the explicit reason it was not run.
- Screenshot artifact paths when the smoke captures them.
- Whether the app session was restored from the disposable E2E account to the developer's daily account before manual acceptance.
- Any Computer Use fallback steps, remaining manual visual checks, or known instability.
