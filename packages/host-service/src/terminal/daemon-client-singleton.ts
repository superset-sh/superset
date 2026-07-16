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
let plannedRotationActive = false;

/**
 * Subscribers notified whenever the active DaemonClient disconnects.
 * terminal.ts hooks this to close WS sockets and clear in-memory session
 * state — without it, sockets stay open and input/resize silently fails.
 */
const disconnectListeners = new Set<(err?: Error) => void>();

export interface DaemonPlannedRotationBinding {
	/** Pure preflight; every listener is validated before any listener commits. */
	validate(): void;
	/** Publish the candidate transport and flush its staged events exactly once. */
	commit(): void;
	/** Drop the candidate. A retry preserves its baseline; a final drop clears it. */
	discard(options: { final: boolean }): void;
}

const plannedRotationListeners = new Set<
	(
		client: DaemonClient,
	) => DaemonPlannedRotationBinding | Promise<DaemonPlannedRotationBinding>
>();
const ADOPTED_ACTIVATION_MAX_ATTEMPTS = 2;

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
	cb: (
		client: DaemonClient,
	) => DaemonPlannedRotationBinding | Promise<DaemonPlannedRotationBinding>,
): () => void {
	plannedRotationListeners.add(cb);
	return () => {
		plannedRotationListeners.delete(cb);
	};
}

async function stagePlannedRotationListeners(
	successor: DaemonClient,
): Promise<DaemonPlannedRotationBinding[]> {
	const bindings: DaemonPlannedRotationBinding[] = [];
	try {
		for (const listener of plannedRotationListeners) {
			bindings.push(await listener(successor));
		}
		return bindings;
	} catch (error) {
		for (const binding of bindings) {
			try {
				binding.discard({ final: true });
			} catch {
				// Best-effort rollback of listeners that staged successfully.
			}
		}
		throw error;
	}
}

async function activateAdoptedWithRetry(
	initialSuccessor: DaemonClient,
): Promise<void> {
	let successor = initialSuccessor;
	let lastError: unknown;
	for (let attempt = 1; attempt <= ADOPTED_ACTIVATION_MAX_ATTEMPTS; attempt++) {
		let bindings: DaemonPlannedRotationBinding[] = [];
		try {
			bindings = await stagePlannedRotationListeners(successor);
			for (const binding of bindings) binding.validate();
			await successor.activateAdopted();
			// Output can arrive while activate-adopted is awaiting its ACK. Recheck
			// caps/invariants before atomically publishing any candidate.
			for (const binding of bindings) binding.validate();
			for (const binding of bindings) binding.commit();
			return;
		} catch (error) {
			lastError = error;
			const final = attempt === ADOPTED_ACTIVATION_MAX_ATTEMPTS;
			for (const binding of bindings) {
				try {
					binding.discard({ final });
				} catch {
					// Candidate teardown is best-effort after a transport failure.
				}
			}
			if (final) break;
			if (!successor.isConnected) {
				// A lost candidate never reached real terminal observers. Reconnect and
				// request replay again; each binding retains the original byte cursor so
				// the replacement can recover the socket-gap suffix exactly once.
				successor = await getDaemonClient();
			}
		}
	}
	throw lastError instanceof Error
		? lastError
		: new Error(`activate-adopted failed: ${String(lastError)}`);
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
			if (handoffClient === client || (plannedRotationActive && wasCached)) {
				// The supervisor owns this transition. Suppress the generic failure
				// path until it has proven either successor ownership plus activation,
				// or a safe abort. This includes successor sockets lost during the
				// activate-adopted retry window; clearing host sessions there would race
				// the rebind that the retry performs on its replacement socket.
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
	plannedRotationActive = false;
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
		handoffClient = client;
		handoffDisconnectSuppressed = false;
		plannedRotationActive = true;
		// list() is a request/reply on the same socket used by input/resize.
		// Its reply proves every earlier fire-and-forget frame was consumed. Mark
		// the lifecycle before awaiting it so a close racing the reply is already
		// classified as part of this controlled rotation.
		await client.list();
	},
	invalidateAfterSuccess: async (organizationId) => {
		if (organizationId !== getOrganizationId()) return;
		const predecessor = handoffClient;
		if (cached === predecessor) cached = null;

		// Keep handoffClient set until dispose finishes so the socket's close
		// callback remains classified as a planned rotation.
		if (predecessor) await predecessor.dispose().catch(() => {});
		handoffClient = null;

		// Supervisor has already persisted and published the proven successor.
		// Connect now, stage every host subscription, release adopted readers, then
		// atomically publish the candidate before release() sends held input.
		const successor = await getDaemonClient();
		try {
			await activateAdoptedWithRetry(successor);
			plannedRotationActive = false;
			handoffDisconnectSuppressed = false;
		} catch (error) {
			plannedRotationActive = false;
			handoffDisconnectSuppressed = false;
			const failure = error instanceof Error ? error : new Error(String(error));
			// Ownership already committed to the successor. If transactional rebind
			// cannot complete, fall back to the ordinary renderer reconnect path once.
			notifyDisconnectListeners(failure);
			throw failure;
		}
	},
	resumeAfterAbort: async (organizationId) => {
		if (organizationId !== getOrganizationId()) return;
		const client = handoffClient;
		const disconnected =
			client !== null && (handoffDisconnectSuppressed || !client.isConnected);
		handoffClient = null;
		handoffDisconnectSuppressed = false;
		plannedRotationActive = false;
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
		plannedRotationActive = false;
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
