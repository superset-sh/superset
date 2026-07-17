/**
 * Per-organization writer gate for pty-daemon mutations.
 *
 * A daemon handoff transfers a point-in-time set of PTY file descriptors. New
 * opens and writes must therefore stop before `prepare-upgrade`, then resume
 * against exactly one owner after the handoff outcome is known. Reads and the
 * supervisor's own control-plane client deliberately bypass this gate.
 *
 * This module has no imports from either DaemonSupervisor or the daemon-client
 * singleton. That is intentional: both sides depend on the gate, so importing
 * either of them here would create an initialization cycle.
 */

export type DaemonMutationKind =
	| "open"
	| "input"
	| "resize"
	| "close"
	| "dispose"
	| "other";

export interface DaemonMutationQueueLimits {
	maxOperations: number;
	maxBytes: number;
}

export interface DaemonMutationDescriptor {
	kind: DaemonMutationKind;
	/** Immutable payload size retained by the queued closure. */
	byteCost?: number;
}

export interface DaemonMutationTransportHooks {
	/**
	 * Same-connection request/reply barrier. Once it resolves, every earlier
	 * fire-and-forget mutation written through the cached client was processed.
	 * The transport may also mark that connection as an expected handoff close,
	 * preventing the generic disconnect path from racing the controlled rotation.
	 */
	barrier(organizationId: string): Promise<void>;
	/** Drop the predecessor transport before queued operations select a client. */
	invalidateAfterSuccess(organizationId: string): Promise<void>;
	/** Cancel the expected-close marker and keep using the predecessor. */
	resumeAfterAbort(organizationId: string): Promise<void>;
	/** Drop all stale transports after an explicit destructive restart. */
	resetAfterForceRestart(organizationId: string, error: Error): Promise<void>;
}

export interface DaemonUpdateMutationLease {
	waitUntilDrained(): Promise<void>;
	release(outcome: "success" | "abort"): Promise<void>;
	/**
	 * A force restart intentionally destroyed the old PTYs. Reject held work
	 * visibly, rotate transport, and reopen the gate instead of replaying input
	 * to nonexistent sessions.
	 */
	resetAfterForceRestart(error: Error): Promise<void>;
}

const DEFAULT_LIMITS: DaemonMutationQueueLimits = {
	maxOperations: 4_096,
	maxBytes: 16 * 1024 * 1024,
};

type GateState = "open" | "holding" | "releasing-success" | "releasing-abort";

interface QueuedMutation<T> {
	descriptor: Required<DaemonMutationDescriptor>;
	operation: () => Promise<T>;
	resolve: (value: T | PromiseLike<T>) => void;
	reject: (reason?: unknown) => void;
}

interface DrainWaiter {
	resolve: () => void;
}

export class DaemonMutationQueueOverflowError extends Error {
	readonly code = "EDAEMONUPDATEQUEUEFULL";

	constructor(
		organizationId: string,
		descriptor: Required<DaemonMutationDescriptor>,
		limits: DaemonMutationQueueLimits,
	) {
		super(
			`pty-daemon update queue is full for ${organizationId}; rejected ${descriptor.kind} mutation (limit ${limits.maxOperations} operations / ${limits.maxBytes} bytes)`,
		);
		this.name = "DaemonMutationQueueOverflowError";
	}
}

class OrganizationMutationGate {
	private readonly organizationId: string;
	private readonly limits: DaemonMutationQueueLimits;
	private state: GateState = "open";
	private activeOperations = 0;
	private queuedBytes = 0;
	private readonly queue: QueuedMutation<unknown>[] = [];
	private readonly drainWaiters: DrainWaiter[] = [];

	constructor(organizationId: string, limits: DaemonMutationQueueLimits) {
		this.organizationId = organizationId;
		this.limits = limits;
	}

	run<T>(
		descriptor: DaemonMutationDescriptor,
		operation: () => Promise<T>,
	): Promise<T> {
		const normalized = normalizeDescriptor(descriptor);
		if (this.state === "open") {
			return this.runActive(operation);
		}

		if (
			this.queue.length >= this.limits.maxOperations ||
			this.queuedBytes + normalized.byteCost > this.limits.maxBytes
		) {
			return Promise.reject(
				new DaemonMutationQueueOverflowError(
					this.organizationId,
					normalized,
					this.limits,
				),
			);
		}

		this.queuedBytes += normalized.byteCost;
		return new Promise<T>((resolve, reject) => {
			this.queue.push({
				descriptor: normalized,
				operation,
				resolve,
				reject,
			} as QueuedMutation<unknown>);
		});
	}

	beginUpdate(): DaemonUpdateMutationLease {
		if (this.state !== "open") {
			throw new Error(
				`pty-daemon mutation gate for ${this.organizationId} is already ${this.state}`,
			);
		}

		// This assignment is deliberately synchronous. A caller can invoke
		// beginUpdate(), ignore the returned promise for a tick, and mutations
		// arriving in that tick are already held.
		this.state = "holding";
		let completed = false;
		let releaseRunning = false;
		const activeDrained = this.waitForActiveOperations();
		const handoffReady = activeDrained.then(() =>
			transportHooks.barrier(this.organizationId),
		);
		return {
			waitUntilDrained: () => handoffReady,
			release: async (outcome) => {
				if (completed || releaseRunning) {
					throw new Error(
						`pty-daemon mutation gate lease for ${this.organizationId} was already released`,
					);
				}
				releaseRunning = true;
				// Success is valid only after the same-socket barrier. Abort is also
				// allowed when that barrier itself failed, but never before active
				// mutations have stopped.
				try {
					if (outcome === "success") await handoffReady;
					else await activeDrained;
					await this.release(outcome);
					completed = true;
				} finally {
					releaseRunning = false;
				}
			},
			resetAfterForceRestart: async (error) => {
				if (completed || releaseRunning) {
					throw new Error(
						`pty-daemon mutation gate lease for ${this.organizationId} was already released`,
					);
				}
				releaseRunning = true;
				try {
					await activeDrained;
					await this.resetAfterForceRestart(error);
					completed = true;
				} finally {
					releaseRunning = false;
				}
			},
		};
	}

	private runActive<T>(operation: () => Promise<T>): Promise<T> {
		this.activeOperations += 1;
		return Promise.resolve()
			.then(operation)
			.finally(() => {
				this.activeOperations -= 1;
				if (this.activeOperations === 0) {
					for (const waiter of this.drainWaiters.splice(0)) waiter.resolve();
				}
			});
	}

	private waitForActiveOperations(): Promise<void> {
		if (this.activeOperations === 0) return Promise.resolve();
		return new Promise<void>((resolve) => {
			this.drainWaiters.push({ resolve });
		});
	}

	private async release(outcome: "success" | "abort"): Promise<void> {
		if (this.state !== "holding") {
			throw new Error(
				`cannot release pty-daemon mutation gate for ${this.organizationId} from ${this.state}`,
			);
		}

		this.state =
			outcome === "success" ? "releasing-success" : "releasing-abort";
		if (outcome === "success") {
			// Keep queuing while the predecessor transport is invalidated. Every
			// closure below selects the current client only when it executes.
			await transportHooks.invalidateAfterSuccess(this.organizationId);
		} else {
			await transportHooks.resumeAfterAbort(this.organizationId);
		}

		// Deliberately serial. Operations arriving during an await append to the
		// same tail and are included before the state returns to `open`.
		while (this.queue.length > 0) {
			const entry = this.queue.shift();
			if (!entry) continue;
			this.queuedBytes -= entry.descriptor.byteCost;
			try {
				entry.resolve(await entry.operation());
			} catch (error) {
				entry.reject(error);
			}
		}

		this.queuedBytes = 0;
		this.state = "open";
	}

	private async resetAfterForceRestart(error: Error): Promise<void> {
		if (
			this.state !== "holding" &&
			this.state !== "releasing-success" &&
			this.state !== "releasing-abort"
		) {
			throw new Error(
				`cannot reset pty-daemon mutation gate for ${this.organizationId} from ${this.state}`,
			);
		}
		this.state = "releasing-success";
		await transportHooks.resetAfterForceRestart(this.organizationId, error);
		while (this.queue.length > 0) {
			const entry = this.queue.shift();
			if (!entry) continue;
			this.queuedBytes -= entry.descriptor.byteCost;
			entry.reject(error);
		}
		this.queuedBytes = 0;
		this.state = "open";
	}
}

function normalizeDescriptor(
	descriptor: DaemonMutationDescriptor,
): Required<DaemonMutationDescriptor> {
	const byteCost = descriptor.byteCost ?? 0;
	if (!Number.isSafeInteger(byteCost) || byteCost < 0) {
		throw new Error(`Invalid daemon mutation byteCost: ${byteCost}`);
	}
	return { ...descriptor, byteCost };
}

const gates = new Map<string, OrganizationMutationGate>();
let transportHooks: DaemonMutationTransportHooks = {
	barrier: async () => {},
	invalidateAfterSuccess: async () => {},
	resumeAfterAbort: async () => {},
	resetAfterForceRestart: async () => {},
};

function gateFor(
	organizationId: string,
	limits: DaemonMutationQueueLimits = DEFAULT_LIMITS,
): OrganizationMutationGate {
	let gate = gates.get(organizationId);
	if (!gate) {
		gate = new OrganizationMutationGate(organizationId, limits);
		gates.set(organizationId, gate);
	}
	return gate;
}

export function runDaemonMutation<T>(
	organizationId: string,
	descriptor: DaemonMutationDescriptor,
	operation: () => Promise<T>,
): Promise<T> {
	return gateFor(organizationId).run(descriptor, operation);
}

export function beginDaemonUpdate(
	organizationId: string,
): DaemonUpdateMutationLease {
	return gateFor(organizationId).beginUpdate();
}

/** Register transport hooks without making the gate depend on the singleton. */
export function registerDaemonMutationTransportHooks(
	hooks: DaemonMutationTransportHooks,
): () => void {
	const previous = transportHooks;
	transportHooks = hooks;
	return () => {
		if (transportHooks === hooks) {
			transportHooks = previous;
		}
	};
}

/** Test-only: isolate queue state and optionally use small deterministic caps. */
export function __createDaemonMutationGateForTesting(
	organizationId: string,
	limits: DaemonMutationQueueLimits,
): {
	run<T>(
		descriptor: DaemonMutationDescriptor,
		operation: () => Promise<T>,
	): Promise<T>;
	beginUpdate(): DaemonUpdateMutationLease;
} {
	const gate = new OrganizationMutationGate(organizationId, limits);
	return {
		run: (descriptor, operation) => gate.run(descriptor, operation),
		beginUpdate: () => gate.beginUpdate(),
	};
}
