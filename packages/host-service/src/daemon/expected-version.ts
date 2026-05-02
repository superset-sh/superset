// Bundled daemon version. Hand-edited in lockstep with
// `packages/pty-daemon/package.json#version` and `DAEMON_PACKAGE_VERSION`
// in `packages/pty-daemon/src/index.ts`. Drift catches in
// expected-version.test.ts.
//
// Drives the "update pending" UX: when host-service adopts a daemon at
// an older version, the renderer surfaces an "Update available" badge.
// Passed to spawned daemons via `SUPERSET_PTY_DAEMON_VERSION` and probed
// back on adoption. We do NOT auto-kill on mismatch — sessions live in
// the daemon; the user explicitly triggers restart.
export const EXPECTED_DAEMON_VERSION = "0.2.0";
