# `bun run dev` cleanup audit

## Problem

Killing `bun run dev` (Ctrl-C, IDE stop, turbo subtask SIGTERM) does not reliably take down every child process it started. Symptoms: ports 3000/3001/8787 stay bound after exit; `host-service` and `pty-daemon` keep running between dev sessions; "address in use" errors on the next `bun run dev`.

## What `bun run dev` actually starts

```
bun run dev
└── turbo run dev dev:caddy --filter=@superset/{api,web,desktop} --filter=electric-proxy --filter=//
    ├── (root) dev:caddy        → dotenv -- caddy run --config Caddyfile
    ├── apps/api dev            → dotenv -e ../../.env -- sh -c 'next dev --port ${API_PORT:-3001}'
    ├── apps/web dev            → dotenv -e ../../.env -- sh -c 'next dev --port ${WEB_PORT:-3000}'
    ├── apps/desktop dev        → electron-vite dev --watch  (spawns Electron main)
    │   └── Electron main
    │       └── HostServiceCoordinator.spawn → host-service (detached, unref'd)
    │           └── DaemonSupervisor.spawn   → pty-daemon (detached, unref'd)
    └── apps/electric-proxy dev → dotenv -e ../../.env -- sh -c 'wrangler dev --port ${WRANGLER_PORT:-8787}'
```

## Issues

### 1. `sh -c` without `exec` orphans the real process

`sh -c 'next dev …'` makes the shell the parent of `next`. On a process-group-wide SIGINT (interactive Ctrl-C) everything dies together so this hides. But when a supervisor (turbo, IDE, `kill <pid>`) sends SIGTERM to the *subtask pid only*, `sh` exits without forwarding and `next`/`wrangler` is orphaned, still bound to its port.

| File | Line | Current |
|---|---|---|
| `apps/api/package.json` | 21 | `dotenv -e ../../.env -- sh -c 'next dev --port ${API_PORT:-3001}'` |
| `apps/web/package.json` | 18 | `dotenv -e ../../.env -- sh -c 'next dev --port ${WEB_PORT:-3000}'` |
| `apps/electric-proxy/package.json` | 17 | `dotenv -e ../../.env -- sh -c 'wrangler dev --port ${WRANGLER_PORT:-8787}'` |

**Fix:** prepend `exec ` inside the `sh -c` string so the shell is replaced by the real binary. Signals then land directly on `next`/`wrangler`.

```diff
- "dev": "dotenv -e ../../.env -- sh -c 'next dev --port ${API_PORT:-3001}'"
+ "dev": "dotenv -e ../../.env -- sh -c 'exec next dev --port ${API_PORT:-3001}'"
```

### 2. `host-service` is `detached: true` + `child.unref()` — survives `bun dev` kill

`apps/desktop/src/main/lib/host-service-coordinator.ts:427-433, 470`

```ts
child = childProcess.spawn(process.execPath, [this.scriptPath], {
  detached: true,
  stdio,
  env: childEnv,
  windowsHide: true,
});
…
child.unref();
```

This is intentional for production — `apps/desktop/HOST_SERVICE_LIFECYCLE.md:39-62` describes manifest-based adoption so PTYs survive Electron restarts. The cost in dev: when `bun dev` is Ctrl-C'd, Electron dies without invoking any `stopAll()` path, and the detached host-service plus its detached pty-daemon stay alive.

The existing mitigation (`82c337058 feat(host-service): kill stale daemon on dev-mode startup` + `MIN_HOST_SERVICE_VERSION` bumps in coordinator.ts:55) cleans up *on next launch*, not on shutdown. Between dev runs you accumulate stale `electron`-as-node host-service processes and stale daemons.

The host-service itself has a dev-mode shutdown that kills the daemon (`packages/host-service/src/serve.ts:50-76`), but it only fires if host-service receives SIGINT/SIGTERM, which it doesn't on `bun dev` kill.

**Fix options (pick one):**

- **A. Don't detach in dev.** In `host-service-coordinator.ts:spawn`, branch on `app.isPackaged`:
  ```ts
  const isDev = !app.isPackaged;
  child = childProcess.spawn(process.execPath, [this.scriptPath], {
    detached: !isDev,
    stdio,
    env: childEnv,
    windowsHide: true,
  });
  if (!isDev) child.unref();
  ```
  Pros: simplest, leverages the existing serve.ts dev-shutdown to cascade to the daemon.
  Cons: host-service hot-reload (`enableDevReload`) still works since it explicitly `restartAll`s; nothing else relies on dev survival.

- **B. Install a SIGTERM/SIGINT handler in Electron main** that calls `coordinator.stopAll()` before exiting. Requires that Electron's main process actually gets the signal — `electron-vite dev` propagates SIGTERM to Electron, so this should work, but verify.

Option A is preferred — fewer moving parts and the existing detach/adopt path remains untouched in production.

### 3. `pty-daemon` detached under host-service

`packages/host-service/src/daemon/DaemonSupervisor.ts:425, 488`. Same `detached: true` + `unref()`. Already handled cleanly *if host-service receives SIGTERM* via `serve.ts:50-76`. Fixing #2 fixes this transitively — no separate work needed.

### 4. `terminal-host` daemon (used by both v1 and v2)

`apps/desktop/src/main/lib/terminal-host/client.ts:1188-1221`. Same `detached: true` + `child.unref()` pattern. `HOST_SERVICE_LIFECYCLE.md:64-66` describes this as the v1 path, but renderer callers under `routes/_authenticated/` (v2 settings, tasks `OpenInWorkspace`/`RunInWorkspacePopover`, `AgentHooks`) all hit the same `terminal.*` tRPC router → `getTerminalHostClient()`. So terminal-host is on the v2 codepath too — not v1-exclusive.

**Fix:** same shape as host-service — `detached: !isDev` + `if (!isDev) child.unref()`, gated on `!app.isPackaged`.

### 5. `dev:caddy` — likely fine

`package.json:21` `dotenv -- caddy run --config Caddyfile` has no intermediate `sh -c`. `dotenv-cli@11` uses `cross-spawn` and forwards SIGINT/SIGTERM. No fix needed unless verification shows otherwise.

## What's already good

- `packages/pty-daemon/src/main.ts:60-79` — clean SIGINT/SIGTERM with re-entry guard and deterministic `process.exit(0)`.
- `packages/host-service/src/serve.ts:50-76` — dev-only shutdown handler that calls `supervisor.stop(orgId)` before exit. Just needs to reliably *receive* the signal (issue #2).
- `host-service-coordinator.ts:130-146` — `stop()` SIGTERMs the pid and removes the manifest. Solid; just isn't called on `bun dev` kill today.

## Proposed change order

1. **`exec` in the three `sh -c` dev scripts.** Lowest risk, fixes the most common "port already in use" symptom.
2. **Don't detach host-service in dev** (option A above). Cascades the fix to pty-daemon via the existing serve.ts handler.
3. Verify with:
   ```sh
   bun run dev &
   BUN_DEV_PID=$!
   sleep 20  # let everything start
   kill $BUN_DEV_PID
   sleep 3
   lsof -iTCP -sTCP:LISTEN | grep -E '3000|3001|8787'
   pgrep -lf 'host-service|pty-daemon|next dev|wrangler|electron'
   ```
   Both should be empty.

## Prod safety

Each fix is dev-only by construction:

1. **`exec` in `sh -c`** — only edits `"dev"` scripts in `apps/{api,web,electric-proxy}/package.json`. Prod uses `next start` / `wrangler deploy`, which never go through these scripts. No production codepath touched.
2. **`detached: !isDev` in host-service-coordinator** — gated on `!app.isPackaged`. Packaged production builds take the existing `detached: true` + `unref()` path unchanged, preserving manifest-based adoption and PTY survival across Electron restarts (`HOST_SERVICE_LIFECYCLE.md:39-62`).
3. **pty-daemon** — no direct edit; behavior changes transitively only when host-service is non-detached, which is dev-only.
4. **`detached: !isDev` in terminal-host client** — same `!app.isPackaged` gate. Packaged builds keep terminal-host detached so PTYs survive Electron restarts.

Cloud apps (`apps/api`, `apps/web`) deploy via `next build` / `next start` — neither references the `dev` script. The desktop production bundle is built via `bun run build` → `electron-vite build` + `electron-builder`, which doesn't invoke `bun dev` either.

## Verification (2026-05-02)

Applied fixes:

| # | File | Change |
|---|---|---|
| 1 | `apps/api/package.json:9` | `sh -c 'next dev …'` → `sh -c 'exec next dev …'` |
| 1 | `apps/web/package.json:9` | same |
| 1 | `apps/electric-proxy/package.json:7` | `sh -c 'wrangler dev …'` → `sh -c 'exec wrangler dev …'` |
| 2 | `apps/desktop/src/main/lib/host-service-coordinator.ts:425-435, 470-477` | `detached: !isDev` + `if (!isDev) child.unref()` |
| 4 | `apps/desktop/src/main/lib/terminal-host/client.ts:1188-1226` | `detached: !isDev` + `if (!isDev) child.unref()` |

`apps/desktop` typecheck clean.

Run / kill loop:

```sh
bun run dev > /tmp/bundev.log 2>&1 &
# wait until web/api/wrangler ports listen, +15s settle
kill -INT -<PGID>
```

Result within 1s of SIGINT — completely clean:
- ports 4980 / 4981 / 4985 / 4990 / 4993 — *all* released
- processes: every `dotenv`, `sh`, `next dev`, `wrangler`, `workerd`, `caddy`, `electron-vite`, `Electron` main + helpers, `turbo` from this worktree — gone

Caveats — paths *not* exercised in this run:
- **host-service** never spawned (no org logged in). Fix is symmetric to terminal-host, typecheck-clean, gated on `!app.isPackaged`.
- **terminal-host** never spawned (lazy on first renderer terminal call; no UI interaction in headless test). Fix is the same shape as host-service.

Both the host-service and terminal-host code changes are by-construction prod-neutral and follow standard Node child-process semantics: a non-detached, ref'd child receives the parent's death signal. Live UI verification with a logged-in org and a real terminal session is still the right next step.

## Out of scope

- Turbo `"ui": "tui"` signal handling (no concrete evidence of leaks here; revisit if #1+#2 don't fully resolve symptoms).
- v1 `terminal-host` daemon cleanup (v1 sunset). Same fix applies if extended later.
- Production manifest-adoption behavior — unchanged by any of the above.
