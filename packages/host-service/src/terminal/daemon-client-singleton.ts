// Lazy singleton DaemonClient for host-service. The desktop coordinator
// passes the daemon socket path via SUPERSET_PTY_DAEMON_SOCKET. We connect
// once on first use and reuse the connection for all sessions.
//
// On disconnect we surface via console.error and let the next caller fail —
// the desktop coordinator is responsible for respawning the daemon and
// host-service can be restarted to reconnect. There's no in-band reconnect
// here on purpose; see DaemonClient's "dumb" failure model.

import { DaemonClient } from "./DaemonClient/index.ts";

let cached: DaemonClient | null = null;
let connecting: Promise<DaemonClient> | null = null;

export function ptyDaemonSocketPath(): string {
	const path = process.env.SUPERSET_PTY_DAEMON_SOCKET;
	if (!path) {
		throw new Error(
			"pty-daemon is not available: SUPERSET_PTY_DAEMON_SOCKET is not set. The desktop coordinator should set this before spawning host-service. Terminals will not work until the daemon comes up.",
		);
	}
	return path;
}

export async function getDaemonClient(): Promise<DaemonClient> {
	if (cached?.isConnected) return cached;
	if (connecting) return connecting;
	const client = new DaemonClient({ socketPath: ptyDaemonSocketPath() });
	client.onDisconnect((err) => {
		console.error(
			"[host-service] pty-daemon disconnected:",
			err?.message ?? "",
		);
		if (cached === client) cached = null;
	});
	connecting = client
		.connect()
		.then(() => {
			cached = client;
			return client;
		})
		.finally(() => {
			connecting = null;
		});
	return connecting;
}

/** For tests / shutdown only. */
export async function disposeDaemonClient(): Promise<void> {
	const c = cached;
	cached = null;
	if (c) await c.dispose();
}
