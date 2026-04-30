// Bundled daemon version. **Hand-edited to match
// `packages/pty-daemon/package.json#version`** — keep them in lockstep.
//
// This drives the "update pending — restart terminals to apply" UX:
// when host-service adopts a daemon whose version (read via hello-ack)
// is older than this constant, the renderer surfaces a flag.
//
// We pass this to spawned daemons via `SUPERSET_PTY_DAEMON_VERSION` and
// probe it back on adoption. We do **not** auto-kill on mismatch (sessions
// live in the daemon); the user explicitly triggers restart.
//
// TODO: replace with a build-step that reads
// `node_modules/@superset/pty-daemon/package.json` and writes a generated
// constant, so the lockstep can't drift silently. For now: hand-edit and
// rely on PR review.
export const EXPECTED_DAEMON_VERSION = "0.1.0";
