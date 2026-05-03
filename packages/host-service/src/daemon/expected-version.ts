// Drives the "update pending" UX: host-service marks updatePending=true
// when an adopted daemon's version is below this. Derived from the
// daemon's own package.json so a daemon bump automatically forces the
// upgrade — the only valid daemon-version source of truth in the repo
// is `pty-daemon/package.json#version`.
//
// We pass this to spawned daemons via SUPERSET_PTY_DAEMON_VERSION and
// probe it back on adoption. We do NOT auto-kill on mismatch — sessions
// live in the daemon; the user explicitly triggers restart.

import ptyDaemonPackageJson from "@superset/pty-daemon/package.json" with {
	type: "json",
};

export const EXPECTED_DAEMON_VERSION: string = ptyDaemonPackageJson.version;
