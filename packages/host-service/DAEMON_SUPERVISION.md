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
- Daemon wire protocol coverage lives in `packages/pty-daemon/test/`
  (handshake, adoption, SIGKILL recovery).

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
