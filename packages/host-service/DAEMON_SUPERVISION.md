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
- **Expected version**: `src/daemon/expected-version.ts` — hand-edited
  `EXPECTED_DAEMON_VERSION`, kept in lockstep with
  `packages/pty-daemon/package.json#version`. Drives the
  "update available, restart terminals" UX.
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

Bumping the daemon version: edit `EXPECTED_DAEMON_VERSION` in
`expected-version.ts` to match the new `packages/pty-daemon/package.json#version`.
The supervisor's adoption probe will surface the "update available" flag
on existing installs until they restart.

Bumping host-service-level features that the desktop coordinator
needs to refuse to adopt old binaries: bump `HOST_SERVICE_VERSION`
in `src/trpc/router/host/host.ts` and `MIN_HOST_SERVICE_VERSION` in
`apps/desktop/src/main/lib/host-service-coordinator.ts` together.
The coordinator's `tryAdopt` does a `semver.satisfies(>=)` check and
SIGTERMs+respawns anything older.

## Phase 2 deferred — daemon upgrades currently kill sessions

The original Architecture E plan called for **daemon-upgrade fd-handoff**
so even daemon-binary changes preserve PTYs. Phase 0 (the Go and
node-pty harnesses in the design-doc branch) proved the primitive
works. **Phase 2 is not built in this codebase yet.**

Today: clicking "Restart and update" in Settings → Manage daemon
SIGTERMs the running daemon and spawns the new bundle. All sessions
die in the gap. The confirmation dialog tells the user this.

When Phase 2 lands: the supervisor will spawn the new daemon with
existing PTY master FDs in its `stdio` array (kernel-level dup,
refcount preserved across the swap). New daemon adopts the FDs,
takes over the socket, old daemon exits without closing them.
Sessions survive the upgrade.

Hooks already in place that Phase 2 will use:
- Adopted-liveness check (it'll detect the old daemon's exit at
  the supervisor level if anything goes wrong mid-handoff).
- Manifest-based daemon discovery (the supervisor's current
  `tryAdopt` is what Phase 2's "fall back if handoff fails" path
  reuses).
- Existing wire protocol (we'd add an `upgrade` message; the
  protocol is versioned).

See `apps/desktop/plans/20260430-pty-daemon-host-service-migration.md`
in the design-doc branch for the migration journey and Phase 2 sketch.
