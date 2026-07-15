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
import {
	type DaemonMutationDescriptor,
	registerDaemonMutationTransportHooks,
	runDaemonMutation,
} from "./daemon-mutation-gate.ts";

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
let handoffClient: DaemonClient | null = null;
let handoffDisconnectSuppressed = false;

/**
 * Subscribers notified whenever the active DaemonClient disconnects.
 * terminal.ts hooks this to close WS sockets and clear in-memory session
 * state — without it, sockets stay open and input/resize silently fails.
 */
const disconnectListeners = new Set<(err?: Error) => void>();
const plannedRotationListeners = new Set<
	(client: DaemonClient) => void | Promise<void>
>();

function notifyDisconnectListeners(err?: Error): void {
	for (const listener of disconnectListeners) {
		try {
			listener(err);
		} catch (cbErr) {
			console.error("[host-service] daemon-disconnect listener threw:", cbErr);
		}
	}
}

export function onDaemonDisconnect(cb: (err?: Error) => void): () => void {
	disconnectListeners.add(cb);
	return () => {
		disconnectListeners.delete(cb);
	};
}

/**
 * Subscribe to a proven-successful daemon transport rotation. Unlike an
 * unexpected disconnect, a planned rotation keeps PTYs and host-side terminal
 * sessions alive; listeners must rebind their output subscriptions before the
 * mutation gate flushes held input to the successor.
 */
export function onDaemonPlannedRotation(
	cb: (client: DaemonClient) => void | Promise<void>,
): () => void {
	plannedRotationListeners.add(cb);
	return () => {
		plannedRotationListeners.delete(cb);
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

export function getDaemonClient(): Promise<DaemonClient> {
	if (cached?.isConnected) return Promise.resolve(cached);
	if (connecting) return connecting;

	// Publish the singleflight promise before ptyDaemonSocketPath()'s first
	// await. Otherwise two callers arriving in the same turn can each construct
	// a client, and the untracked transport later looks like an unexpected daemon
	// disconnect during a planned handoff.
	let ownPromise!: Promise<DaemonClient>;
	const connectWork = (async (): Promise<DaemonClient> => {
		const sockPath = await ptyDaemonSocketPath();
		const client = new DaemonClient({ socketPath: sockPath });
		client.onDisconnect((err) => {
			const wasCached = cached === client;
			if (wasCached) cached = null;
			if (handoffClient === client) {
				// The supervisor owns this transition. Suppress the generic failure
				// path until it has proven either successor ownership or a safe abort;
				// otherwise terminal.ts can clear/reconnect halfway through handoff.
				handoffDisconnectSuppressed = true;
				return;
			}
			// A failed or superseded connection attempt never owned host sessions.
			// Its cleanup must not trigger renderer/session teardown.
			if (!wasCached) return;
			console.error(
				"[host-service] pty-daemon disconnected:",
				err?.message ?? "",
			);
			notifyDisconnectListeners(err);
		});

		try {
			await client.connect();
		} catch (error) {
			// Failed connect — clean up the partially initialized client.
			await client.dispose().catch(() => {});
			throw error;
		}

		if (connecting !== ownPromise) {
			// A force-reset (or shutdown) invalidated this attempt while its socket
			// path/connect awaited. Never let the stale completion resurrect cached.
			await client.dispose().catch(() => {});
			throw new Error("DaemonClient connection attempt was superseded");
		}
		cached = client;
		return client;
	})();
	ownPromise = connectWork.finally(() => {
		// A reset may already have published a newer attempt. Only the owner of
		// this exact singleflight slot is allowed to clear it.
		if (connecting === ownPromise) connecting = null;
	});
	connecting = ownPromise;
	return ownPromise;
}

/**
 * Run one PTY mutation through this host-service org's handoff gate. Callers
 * must capture immutable arguments and resolve getDaemonClient() inside the
 * operation so a held closure selects the post-handoff transport.
 */
export function runCurrentDaemonMutation<T>(
	descriptor: DaemonMutationDescriptor,
	operation: () => Promise<T>,
): Promise<T> {
	return runDaemonMutation(getOrganizationId(), descriptor, operation);
}

/** For tests / shutdown only. */
export async function disposeDaemonClient(): Promise<void> {
	const c = cached;
	const inFlight = connecting;
	cached = null;
	connecting = null;
	handoffClient = null;
	handoffDisconnectSuppressed = false;
	if (c) await c.dispose();
	if (inFlight) {
		const client = await inFlight.catch(() => null);
		if (client) await client.dispose();
	}
}

registerDaemonMutationTransportHooks({
	barrier: async (organizationId) => {
		if (organizationId !== getOrganizationId()) return;
		const inFlight = connecting;
		const client =
			cached ?? (inFlight ? await inFlight.catch(() => null) : null);
		if (!client?.isConnected) return;
		// list() is a request/reply on the same socket used by input/resize.
		// Its reply proves every earlier fire-and-forget frame was consumed.
		await client.list();
		handoffClient = client;
		handoffDisconnectSuppressed = false;
	},
	invalidateAfterSuccess: async (organizationId) => {
		if (organizationId !== getOrganizationId()) return;
		const predecessor = handoffClient;
		if (cached === predecessor) cached = null;

		// Keep handoffClient set until dispose finishes so the socket's close
		// callback remains classified as a planned rotation.
		if (predecessor) await predecessor.dispose().catch(() => {});
		handoffClient = null;
		handoffDisconnectSuppressed = false;

		// Supervisor has already persisted and published the proven successor.
		// Connect now and rebind every host subscription before release() sends
		// any held input. This keeps live WebSockets attached and guarantees the
		// successor processes subscribe frames before subsequent input frames on
		// this same ordered socket.
		const successor = await getDaemonClient();
		for (const listener of plannedRotationListeners) {
			await listener(successor);
		}
	},
	resumeAfterAbort: async (organizationId) => {
		if (organizationId !== getOrganizationId()) return;
		const client = handoffClient;
		const disconnected =
			client !== null && (handoffDisconnectSuppressed || !client.isConnected);
		handoffClient = null;
		handoffDisconnectSuppressed = false;
		if (disconnected) {
			// A proven-safe abort normally leaves the predecessor connected. If it
			// did disconnect anyway, replay the suppressed generic recovery once.
			notifyDisconnectListeners(
				new Error("pty-daemon predecessor disconnected during aborted update"),
			);
		}
	},
	resetAfterForceRestart: async (organizationId, error) => {
		if (organizationId !== getOrganizationId()) return;
		const predecessor = handoffClient;
		const current = cached;
		const inFlight = connecting;
		cached = null;
		connecting = null;
		handoffClient = null;
		handoffDisconnectSuppressed = false;
		if (predecessor) await predecessor.dispose().catch(() => {});
		if (current && current !== predecessor) {
			await current.dispose().catch(() => {});
		}
		if (inFlight) {
			const connected = await inFlight.catch(() => null);
			if (connected && connected !== predecessor && connected !== current) {
				await connected.dispose().catch(() => {});
			}
		}
		// Force restart intentionally destroyed every old PTY. Use the generic
		// recovery path exactly once so renderers discard stale session objects.
		notifyDisconnectListeners(error);
	},
});
