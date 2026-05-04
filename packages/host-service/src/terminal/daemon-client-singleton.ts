// Lazy singleton DaemonClient for host-service. The DaemonSupervisor
// (host-service-internal) owns the daemon's process lifecycle; this
// singleton just connects to the supervisor's socket path on first use
// and reuses the connection for all sessions.
//
// On disconnect we surface via console.error, notify subscribers (terminal.ts
// uses this to close WS sockets so the renderer reconnects against the
// respawned daemon), and let the next caller's getDaemonClient() rebuild
// the client. There's no in-band reconnect here — see DaemonClient's "dumb"
// failure model.

import { getSupervisor, waitForDaemonReady } from "../daemon/index.ts";
import { DaemonClient } from "./DaemonClient/index.ts";

// Read org id directly from process.env rather than importing the validated
// `env` module — this singleton is eagerly loaded by the trpc terminal
// router, so importing `env` here makes every test that boots the router
// crash at import time when the production env vars aren't set.
function getOrganizationId(): string {
	const id = process.env.ORGANIZATION_ID;
	if (!id) {
		throw new Error(
			"ORGANIZATION_ID is not set; pty-daemon cannot be addressed.",
		);
	}
	return id;
}

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

async function ptyDaemonSocketPath(): Promise<string> {
	// Test escape hatch: when SUPERSET_PTY_DAEMON_SOCKET is set explicitly
	// (e.g. by the adoption integration test), skip the supervisor and
	// connect directly. Production paths leave this env var unset; the
	// supervisor's own spawn does not set it.
	const testOverride = process.env.SUPERSET_PTY_DAEMON_SOCKET;
	if (testOverride) return testOverride;

	await waitForDaemonReady(getOrganizationId());
	const sockPath = getSupervisor().getSocketPath(getOrganizationId());
	if (!sockPath) {
		throw new Error(
			"pty-daemon is not available: supervisor returned no socket path. " +
				"The bootstrap must have failed — check host-service logs for spawn errors.",
		);
	}
	return sockPath;
}

export async function getDaemonClient(): Promise<DaemonClient> {
	if (cached?.isConnected) return cached;
	if (connecting) return connecting;
	const sockPath = await ptyDaemonSocketPath();
	const client = new DaemonClient({ socketPath: sockPath });
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
