# `bun run dev` cleanup

## Problem

Killing `bun run dev` left orphan processes (PPID=1): dev servers bound to ports, plus `host-service`, `terminal-host`, and `pty-daemon` accumulating between runs.

## Root causes

1. **`sh -c '<cmd>'` without `exec`** in dev scripts — when a supervisor (turbo, IDE, `kill`) sends SIGTERM to the subtask pid only, `sh` exits without forwarding and `next`/`wrangler` is orphaned, still bound to its port. Hidden in interactive Ctrl-C because pgrp signaling hits everyone.
2. **`detached: true` + `child.unref()`** for host-service, terminal-host, and pty-daemon — intentional in production (manifest adoption / socket adoption survival), but the dev-iteration cleanup was never wired up, so children orphaned to init on every `bun dev` exit.
3. **`before-quit` and dev signal handler** in Electron main called `releaseAll()` / `app.exit(0)` — fine when children were detached, but with attached children (after fix #2) those paths leaked them on graceful Cmd+Q and on `electron-vite`-driven SIGTERM.

## Fixes

| File | Change |
|---|---|
| `apps/{api,web,admin,docs,marketing,electric-proxy}/package.json` | `sh -c '<cmd>'` → `sh -c 'exec <cmd>'` |
| `packages/cli/package.json` | `sh -c 'VAR=… cli-framework dev "$@"'` → `sh -c 'exec env VAR=… cli-framework dev "$@"'` |
| `apps/desktop/src/main/lib/host-service-coordinator.ts` | `detached: !isDev` + `if (!isDev) child.unref()` (`isDev = !app.isPackaged`) |
| `apps/desktop/src/main/lib/terminal-host/client.ts` | same |
| `packages/host-service/src/daemon/DaemonSupervisor.ts` | same, gated on `NODE_ENV !== "production"` (defense-in-depth: covers host-service crash that bypasses serve.ts dev shutdown) |
| `apps/desktop/src/main/index.ts` | dev branches in `before-quit` handler and signal handler now run `runDevQuitCleanup()` (`coordinator.stopAll()` + `terminal-host.shutdownIfRunning`) before exit |

## Prod safety

All daemon-spawn changes branch on `app.isPackaged` (or `NODE_ENV === "production"` for `DaemonSupervisor`). Packaged builds keep `detached: true` + `unref()` and the `releaseAll()` quit path unchanged, preserving manifest-based adoption and PTY survival across restarts (see `apps/desktop/HOST_SERVICE_LIFECYCLE.md`). The `exec` edits only touch `"dev"` scripts; cloud apps deploy via `next start` / `wrangler deploy`, which never run them.

## Verification

`bun run dev` → wait for ports + 45s for Electron to mount and lazy-spawn host-service / terminal-host → SIGINT to pgrp → within 1s, every port (4980/4981/4985/4990/4993) is released and every spawned process from this worktree (turbo, electron-vite, Electron, host-service ×2, terminal-host, next dev ×2, wrangler, workerd, caddy, dotenv shells) is gone.

Graceful path tested separately: `kill -TERM <electron-pid>` (simulating Cmd+Q / electron-vite SIGTERM, not pgrp) cleanly stops host-service ×2 and terminal-host while the rest of `bun dev` keeps running, confirming the new dev quit cleanup fires on the non-pgrp path too.
