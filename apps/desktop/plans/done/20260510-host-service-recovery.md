# Host-service recovery (#4299) — shipped

**Issue:** [superset-sh/superset#4299](https://github.com/superset-sh/superset/issues/4299) — after Cmd+R the v2 right pane goes blank because the renderer keeps getting handed a dead host-service port.

**Root cause:** `tryAdopt` only checked `isProcessAlive(pid)` + app-version. A live-but-not-serving host-service (hung on migrations, deadlocked, port no longer bound) got adopted as `running`, and `getConnection` returned its dead port forever — an absorbing state nothing climbed out of.

## What shipped (PR #4395)

- **Adopt health-check** — `tryAdopt` now `pollHealthCheck`s the manifest endpoint (2s cap) before registering an adopted instance; on failure it SIGKILLs the stale pid, removes the manifest, and falls through to a clean `spawn`. This is the fix.
- **`coordinator.reset(orgId)`** + `hostServiceCoordinator.reset` tRPC mutation — force-kill (SIGKILL on whatever pid the manifest names, even if untracked) + remove manifest + respawn. No UI caller yet; intended for a support escape hatch / future Settings button.
- **Tray "Restart" enabled in `stopped`** — was gated on `isRunning`, i.e. disabled exactly when restart helps; now disabled only while a start is in flight.
- **Coordinator logs through `electron-log`** — adoption health-check failures now land in `main.log` (were bare `console.log`, invisible in packaged builds). `log.warn` on non-ESRCH SIGKILL failures.

## Considered, not shipped

- **Full-screen "host stopped" recovery screen** in the v2-workspace layout — dropped. [#4430](https://github.com/superset-sh/superset/pull/4430) removed the analogous remote `WorkspaceHostOfflineState` ("render optimistically; downstream queries surface their own errors"); a local equivalent would swim against that. A non-blocking banner could be a future PR.
- **Renderer retry-with-backoff** in `LocalHostServiceProvider` — built, then dropped: heavier than the bug needs and invisible without the recovery screen.
- **`reset({ wipeHostDb })`** (archive `host.db` → `host.db.broken-<ts>`) + a Settings "Reset and clear local data" button — deferred until there's a caller.
- **The white-screen-before-Cmd+R variant** — tracked separately at [#4396](https://github.com/superset-sh/superset/issues/4396): `getHostId()` shells out to `ioreg` via `execFileSync` with no timeout, blocking the main event loop when subprocess spawning is sandboxed.
