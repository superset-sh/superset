// Lazy singleton DaemonClient for host-service. The desktop coordinator
// passes the daemon socket path via SUPERSET_PTY_DAEMON_SOCKET. We connect
// once on first use and reuse the connection for all sessions.
//
// On disconnect we surface via console.error, notify subscribers (terminal.ts
// uses this to close WS sockets so the renderer reconnects against the
// respawned daemon), and let the next caller's getDaemonClient() rebuild
// the client. There's no in-band reconnect here — see DaemonClient's "dumb"
// failure model.

import { DaemonClient } from "./DaemonClient/index.ts";

let cached: DaemonClient | null = null;
let connecting: Promise<DaemonClient> | null = null;

/**
 * Subscribers notified whenever the active DaemonClient disconnects.
 * terminal.ts hooks this to close WS sockets and clear in-memory session
 * state — without it, sockets stay open and input/resize silently fails.
 */
const disconnectListeners = new Set<(err?: Error) => void>();

export function onDaemonDisconnect(cb: (err?: Error) => void): () => void {
	disconnectListeners.add(cb);
	return () => {
		disconnectListeners.delete(cb);
	};
}

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
		for (const listener of disconnectListeners) {
			try {
				listener(err);
			} catch (cbErr) {
				console.error(
					"[host-service] daemon-disconnect listener threw:",
					cbErr,
				);
			}
		}
	});
	connecting = client
		.connect()
		.then(() => {
			cached = client;
			return client;
		})
		.catch(async (error) => {
			// Failed connect — clean up the partially initialized client.
			await client.dispose().catch(() => {});
			throw error;
		})
		.finally(() => {
			connecting = null;
		});
	return connecting;
}

/** For tests / shutdown only. */
export async function disposeDaemonClient(): Promise<void> {
	const c = cached;
	const inFlight = connecting;
	cached = null;
	connecting = null;
	if (c) await c.dispose();
	if (inFlight) {
		const client = await inFlight.catch(() => null);
		if (client) await client.dispose();
	}
}
