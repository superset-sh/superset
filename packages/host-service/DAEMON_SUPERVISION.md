# Daemon Supervision

Host-service owns the lifecycle of `@superset/pty-daemon` — the long-lived
PTY process. Supervision lives here (not in the desktop app) so
host-service can be deployed independently of Electron. The daemon
outlives host-service crashes via detached spawn + manifest adoption.

## Where it lives

- **Supervisor**: `src/daemon/DaemonSupervisor.ts` — spawn / adopt /
  restart / crash-circuit. One supervisor per host-service process,
  managing one daemon (per the org host-service was started for).
- **Singleton + bootstrap**: `src/daemon/singleton.ts` — process-level
  cache + `startDaemonBootstrap` / `waitForDaemonReady` for the boot
  pattern below.
- **Manifest**: `src/daemon/manifest.ts` — `$SUPERSET_HOME_DIR/host/{orgId}/pty-daemon-manifest.json`.
  Read by `tryAdopt` on startup to find a still-running daemon from a
  previous host-service incarnation.
- **Expected version**: `src/daemon/expected-version.ts` — derives
  `EXPECTED_DAEMON_VERSION` from `pty-daemon/package.json` at compile
  time (single source of truth). Drives the "update available, restart
  terminals" UX.
- **Renderer surface**: `terminal.daemon.{getUpdateStatus, listSessions, restart}`
  on the host-service tRPC.

## Boot pattern (fire-and-track)

`serve.ts` calls `startDaemonBootstrap(env.ORGANIZATION_ID)` during
startup but does **not** await it. tRPC accepts connections immediately;
non-terminal ops (workspaces, git, chat) work without waiting for the
daemon. Terminal request handlers `await waitForDaemonReady(orgId)`
before using the supervisor's socket path, so an in-flight bootstrap
doesn't race with the first terminal launch.

## Detached spawn + adoption

The daemon is spawned `detached: true` so it survives host-service
exit. On next host-service start, `tryAdopt` reads the manifest, checks
the PID is alive and the socket is reachable, and reuses the running
daemon. PTY sessions therefore survive host-service restarts.

The socket path lives in `os.tmpdir()/superset-ptyd-<sha256(orgId).slice(0,12)>.sock`
— short enough to fit Darwin's 104-byte `sun_path` limit. Owner-only
file mode (0600) is the auth boundary.

### Adopted-daemon liveness check

`child.on("exit")` only fires for daemons we *spawned* — adopted
daemons (PIDs from a manifest) have no child handle. Without a
liveness check, the supervisor's `instances` map carries a stale
entry forever when an adopted daemon dies externally (kill -9, OOM):
`getSocketPath` returns a socket nobody's listening on, terminal ops
fail with ECONNREFUSED until something forces a restart.

We poll `process.kill(pid, 0)` every 2s for adopted PIDs
(`ADOPTED_LIVENESS_INTERVAL_MS`). On detected death we clear the
instance + manifest so the next `ensure()` respawns. Spawned daemons
keep using the cheaper `child.on("exit")` path.

## Version detection

On adoption, `probeDaemonVersion` does a one-shot `hello`/`hello-ack` to
read the running daemon's `daemonVersion`, compares against
`EXPECTED_DAEMON_VERSION` via `semver.satisfies(>=)`. Mismatch sets
`updatePending: true` on the instance — the renderer surfaces a
"restart to update" affordance. We do **not** auto-kill on mismatch
because PTY sessions live in the daemon; the user opts in via Restart.

Probe failure ≠ stale: a transient socket issue produces
`runningVersion: "unknown", updatePending: false` rather than a
false-positive update flag.

## Crash circuit breaker

Auto-respawn unexpected exits, but only up to `CRASH_BUDGET = 3` within
`CRASH_WINDOW_MS = 60_000`. Past that, the circuit opens and `ensure`
fails fast with a clear error until something calls
`clearCrashCircuit(orgId)` — which the user-triggered `restart()`
implicitly does, so the user can always recover.

## User-triggered restart

`restart(orgId)` awaits any in-flight pending spawn, calls `stop`,
clears the crash circuit, logs `pty_daemon_user_restart`, then `ensure`s
fresh. Sessions die in the gap — that's the cost the user accepted via
the confirmation dialog.

### Default close signal: SIGHUP, not SIGTERM

The kill chain (`DaemonClient.close`, daemon `handleClose`,
`DaemonPty.kill`) defaults to **SIGHUP**, not SIGTERM. Interactive
shells — especially `zsh -l`, the default macOS login shell — trap
SIGTERM and stay alive. SIGTERM defaults silently leaked PTY processes
on every closed pane until the daemon was respawned. SIGHUP is what
the kernel sends when a real TTY closes, and shells honor it.

Explicit `SIGKILL` still passes through for hung shells (e.g. the
"force kill" path).

## Session deletion on PTY exit

The daemon's `Server.onExit` handler deletes the session row from
the store immediately after fanning out the exit event. **Late
subscribers that connect after exit get ENOENT**, not the buffered
output and exit event.

Tradeoff: a host-service that restarts during the small window when
a shell is exiting will not be able to fetch the final output via
`subscribe(replay: true)` — the renderer falls back to a generic
"session unavailable" footer instead of "Process exited with code N".
Without this delete, every closed terminal pane left a row in the
store forever (every "Show sessions" entry would have been an Exited
zombie).

## Dev-mode log piping

In dev (`NODE_ENV !== "production"`), both host-service and
pty-daemon stdio is **piped through to the parent process** with
per-line prefixes:

- `[hs:<8-char-orgId>] ...` — host-service stdout in `bun dev`
- `[ptyd:<8-char-orgId>] ...` — daemon stdout, fanned through host-service

Production stdio backs to per-org rotating log files
(`$SUPERSET_HOME_DIR/host/{orgId}/{host-service,pty-daemon}.log`)
because the detached children must outlive parent teardown.

The `pipeWithPrefix` helper splits incoming chunks on `\n` so
multi-line bursts keep the prefix on every line.

## Telemetry

The supervisor emits structured `console.log` lines with
`{ component: "pty-daemon-supervisor", event, ...props }`. Events:
`pty_daemon_spawn`, `pty_daemon_adopt`, `pty_daemon_user_restart`,
`pty_daemon_update_pending`, `pty_daemon_crash`,
`pty_daemon_circuit_open`, `pty_daemon_spawn_failed`. No PostHog
plumbing on host-service yet — promote to real telemetry when the path
is needed.

## Tests

- `src/daemon/DaemonSupervisor.test.ts` — probe edge cases, debounce
  semantics, restart race-await + circuit clear.
- `src/daemon/DaemonSupervisor.node-test.ts` — real-spawn integration:
  fresh spawn, cross-instance adoption, version drift via env override,
  user-restart kills + respawns, auto-respawn after SIGKILL, **adopted
  daemon dies externally → supervisor detects and respawns**.
- `src/daemon/singleton.test.ts` — fire-and-track bootstrap, idempotent
  startDaemonBootstrap, retryable failure path.
- `src/trpc/router/terminal/terminal.daemon.test.ts` — tRPC procedure
  wiring (UNAUTHORIZED gating, getUpdateStatus delegation, listSessions
  awaits bootstrap, restart wiring).
- `src/no-electron-coupling.test.ts` — asserts host-service source has
  zero Electron imports/globals/APIs (substitute for a real headless
  smoke test until native-addon distribution is solved).
- Daemon wire protocol coverage lives in `packages/pty-daemon/test/`
  (handshake, adoption, SIGKILL recovery, **default-close terminates
  an interactive login shell** — SIGHUP regression test).

## Test escape hatch

Setting `SUPERSET_PTY_DAEMON_SOCKET` env var bypasses the supervisor in
`daemon-client-singleton.ts` and connects directly to the given socket.
Used by `terminal.adoption.node-test.ts` to test host-service against an
in-process Server instance. Production paths leave this env unset.

## Extension points

Adding a daemon op the renderer needs:

1. Add a method on `DaemonSupervisor` (or use `getDaemonClient()` from
   `terminal/daemon-client-singleton.ts` if it's a wire-protocol op).
2. Expose via `terminal.daemon` in `src/trpc/router/terminal/terminal.ts`.
3. Call from the renderer via `workspaceTrpc.terminal.daemon.*`.

Bumping the daemon version: edit `packages/pty-daemon/package.json#version`.
That's the only place. `EXPECTED_DAEMON_VERSION` (host-service) and
`DAEMON_PACKAGE_VERSION` (pty-daemon's runtime export) both derive from
that JSON via compile-time imports, so drift is structurally impossible.
The supervisor's adoption probe surfaces "update available" on installs
running an older daemon; clicking "Update daemon" triggers fd-handoff
(Phase 2) so live shells survive the swap.

Bumping host-service-level features that the desktop coordinator
needs to refuse to adopt old binaries: bump `HOST_SERVICE_VERSION`
in `src/trpc/router/host/host.ts` and `MIN_HOST_SERVICE_VERSION` in
`apps/desktop/src/main/lib/host-service-coordinator.ts` together.
The coordinator's `tryAdopt` does a `semver.satisfies(>=)` check and
SIGTERMs+respawns anything older.

## Phase 2 — daemon-upgrade fd-handoff (shipped, PR #3971)

Daemon-binary upgrades preserve live PTY sessions via fd inheritance:

1. Supervisor's `update(orgId)` sends `prepare-upgrade` to the running daemon.
2. Predecessor writes a snapshot (session ids, metadata, ring buffers) and
   spawns the new bundle with PTY master fds in its stdio array, stdio
   `'ipc'` channel for the upgrade-ack handshake, and `--handoff` argv.
3. Successor reads the snapshot, adopts each session via `adoptFromFd`
   (wraps the inherited fd with read/write streams), sends `upgrade-ack`
   over IPC, waits for the predecessor's `disconnect` event, then binds
   the socket via `listenWithRetry`.
4. Supervisor waits for the predecessor PID to exit, retries the version
   probe through the bind window (`probeDaemonVersionWithRetry`), and
   updates `instances` + the manifest with the successor's pid + version.

If anything fails mid-handoff (snapshot write error, successor crash on
adopt, IPC stall) the supervisor's `restoreOnFailure()` path leaves the
predecessor's instance record intact — the user's shells keep serving on
the original daemon process. Auto-update on adopt (`kickoffAutoUpdate`)
relies on this contract: a transient failure must never disrupt sessions.

Mode signal goes through argv (`--handoff`), not env: bundlers
(Bun, esbuild via electron-vite) statically inline `process.env.X`
references and DCE the unused branch. `apps/desktop/scripts/check-pty-daemon-bundle.ts`
greps the post-build bundle for handoff-path markers as a regression
canary.

See `apps/desktop/plans/done/20260501-pty-daemon-phase2-implementation.md`
for the design walkthrough.
