import type { HostDb } from "../db";
import {
	type AgentCapabilityConfig,
	type AgentCapabilityErrorKind,
	AgentCapabilityProbeAbortedError,
	type AgentCapabilitySnapshot,
	inspectAgentCapability,
} from "./agent-capabilities";
import {
	type AgentCapabilityInventory,
	type AgentHealthStatus,
	CAPABILITY_INVENTORY_SCHEMA_VERSION,
	CAPABILITY_SNAPSHOT_DISPLAY_MAX_AGE_MS,
	CapabilityInventoryValidationError,
	displayableCapabilityInventory,
	encodeCapabilityInventory,
	listCapabilitySnapshots,
	type PersistedAgentCapabilitySnapshot,
	SANITIZED_CAPABILITY_MESSAGES,
	writeCapabilitySnapshotIfCurrentRevision,
} from "./capability-snapshot-repository";

export const CAPABILITY_REFRESH_CONCURRENCY = 4;

export interface RevisionedAgentCapabilityConfig extends AgentCapabilityConfig {
	configRevision: number;
}

export class ObsoleteCapabilityRefreshError extends Error {
	constructor(agentId: string) {
		super(`Capability refresh became obsolete for agent ${agentId}`);
		this.name = "ObsoleteCapabilityRefreshError";
	}
}

export interface AgentHealthObservation {
	status: AgentHealthStatus;
	installed: boolean | null;
	auth: "authenticated" | "unauthenticated" | "unknown";
	checkedAt: string;
	errorKind: AgentCapabilityErrorKind | null;
	message: string | null;
}

export interface AgentCapabilityView {
	agentId: string;
	presetId: string;
	inventory: AgentCapabilityInventory | null;
	inventoryOrigin: "live" | "persisted" | "none";
	health: AgentHealthObservation;
	healthOrigin: "live" | "persisted" | "none";
}

type CapabilityProbe = (
	config: AgentCapabilityConfig,
	options: { now?: number; signal?: AbortSignal },
) => Promise<AgentCapabilitySnapshot>;

interface CapabilityRefreshState {
	abortController: AbortController;
	disposed: boolean;
	refreshInFlight: Map<string, Promise<AgentCapabilityView>>;
}

function createCapabilityRefreshState(): CapabilityRefreshState {
	return {
		abortController: new AbortController(),
		disposed: false,
		refreshInFlight: new Map(),
	};
}

function refreshKey(config: RevisionedAgentCapabilityConfig): string {
	return `${config.id}:${config.configRevision}`;
}

function inventoryOrigin(
	liveInventory: AgentCapabilityInventory | null,
	mergedInventory: AgentCapabilityInventory | null,
): AgentCapabilityView["inventoryOrigin"] {
	if (liveInventory !== null) return "live";
	if (mergedInventory !== null) return "persisted";
	return "none";
}

export function persistedCapabilityToView(
	snapshot: PersistedAgentCapabilitySnapshot,
	now = Date.now(),
): AgentCapabilityView {
	const inventory = displayableCapabilityInventory(snapshot.inventory, now);
	return {
		agentId: snapshot.agentId,
		presetId: snapshot.presetId,
		inventory,
		inventoryOrigin: inventory ? "persisted" : "none",
		health: {
			status: snapshot.status,
			installed: snapshot.installed,
			auth: snapshot.auth,
			checkedAt: new Date(snapshot.statusCheckedAt).toISOString(),
			errorKind: snapshot.errorKind,
			message: snapshot.message,
		},
		healthOrigin: "persisted",
	};
}

function sanitizedDiagnosticMessage(
	snapshot: Pick<AgentCapabilitySnapshot, "auth" | "errorKind">,
): string | null {
	if (snapshot.auth === "unauthenticated") {
		return SANITIZED_CAPABILITY_MESSAGES.authenticationRequired;
	}
	switch (snapshot.errorKind) {
		case "missing_executable":
			return SANITIZED_CAPABILITY_MESSAGES.missingExecutable;
		case "timeout":
			return SANITIZED_CAPABILITY_MESSAGES.timeout;
		case "process_failure":
			return SANITIZED_CAPABILITY_MESSAGES.processFailure;
		case "parse_failure":
			return SANITIZED_CAPABILITY_MESSAGES.parseFailure;
		default:
			return null;
	}
}

function isolatedProcessFailureView(
	config: RevisionedAgentCapabilityConfig,
	previous: PersistedAgentCapabilitySnapshot | undefined,
	now: number,
): AgentCapabilityView {
	const checkedAt = new Date(now).toISOString();
	if (!previous) {
		return {
			agentId: config.id,
			presetId: config.presetId,
			inventory: null,
			inventoryOrigin: "none",
			health: {
				status: "unavailable",
				installed: null,
				auth: "unknown",
				checkedAt,
				errorKind: "process_failure",
				message: SANITIZED_CAPABILITY_MESSAGES.processFailure,
			},
			healthOrigin: "live",
		};
	}
	return {
		...persistedCapabilityToView(previous, now),
		health: {
			status: "unavailable",
			installed: previous.installed,
			auth: "unknown",
			checkedAt,
			errorKind: "process_failure",
			message: SANITIZED_CAPABILITY_MESSAGES.processFailure,
		},
		healthOrigin: "live",
	};
}

export function readPersistedCapabilitySnapshots(
	db: HostDb,
	now = Date.now(),
): AgentCapabilityView[] {
	return listCapabilitySnapshots(db, {
		now,
		maxDisplayAgeMs: CAPABILITY_SNAPSHOT_DISPLAY_MAX_AGE_MS,
	}).map((snapshot) => persistedCapabilityToView(snapshot, now));
}

function inventoryFromLiveSnapshot(
	config: RevisionedAgentCapabilityConfig,
	live: AgentCapabilitySnapshot,
): AgentCapabilityInventory | null {
	if (live.modelSource === "none") return null;
	return {
		schemaVersion: CAPABILITY_INVENTORY_SCHEMA_VERSION,
		agentId: config.id,
		presetId: config.presetId,
		configRevision: config.configRevision,
		detectedVersion: live.version,
		modelSource: live.modelSource === "fallback" ? "curated" : "runtime",
		models: live.models,
		inventoryCheckedAt: live.checkedAt,
	};
}

async function refreshCapabilityUncoalesced(
	db: HostDb,
	config: RevisionedAgentCapabilityConfig,
	previous: PersistedAgentCapabilitySnapshot | undefined,
	now: number,
	probe: CapabilityProbe,
	signal: AbortSignal,
): Promise<AgentCapabilityView> {
	let live: AgentCapabilitySnapshot;
	try {
		live = await probe(config, { now, signal });
	} catch (error) {
		if (signal.aborted || error instanceof AgentCapabilityProbeAbortedError) {
			throw new AgentCapabilityProbeAbortedError();
		}
		const errorKind: AgentCapabilityErrorKind =
			error instanceof CapabilityInventoryValidationError
				? "parse_failure"
				: "process_failure";
		live = {
			agentId: config.id,
			presetId: config.presetId,
			status: "unavailable",
			installed: previous?.installed ?? null,
			auth: "unknown",
			version: null,
			modelSource: "none",
			models: [],
			message: null,
			checkedAt: new Date(now).toISOString(),
			errorKind,
		};
	}

	if (signal.aborted) throw new AgentCapabilityProbeAbortedError();

	let liveInventory = inventoryFromLiveSnapshot(config, live);
	if (liveInventory !== null) {
		try {
			encodeCapabilityInventory(liveInventory);
		} catch {
			liveInventory = null;
			live = {
				...live,
				status: "unavailable",
				auth: "unknown",
				modelSource: "none",
				models: [],
				errorKind: "parse_failure",
				message: null,
			};
		}
	}

	const inventory =
		liveInventory ??
		(live.installed === false ? null : (previous?.inventory ?? null));
	const inventoryCheckedAt = inventory
		? Date.parse(inventory.inventoryCheckedAt)
		: null;
	const message = sanitizedDiagnosticMessage(live);
	const written = writeCapabilitySnapshotIfCurrentRevision(
		db,
		{
			agentId: config.id,
			presetId: config.presetId,
			configRevision: config.configRevision,
			inventory,
			status: live.status,
			installed: live.installed,
			auth: live.auth,
			inventoryCheckedAt,
			statusCheckedAt: Date.parse(live.checkedAt),
			writtenAt: Date.parse(live.checkedAt),
			errorKind: live.errorKind ?? null,
			message,
			resolverSource: live.resolverSource ?? null,
		},
		{ persist: true },
	);
	if (!written) throw new ObsoleteCapabilityRefreshError(config.id);
	const displayInventory = displayableCapabilityInventory(inventory, now);
	return {
		agentId: config.id,
		presetId: config.presetId,
		inventory: displayInventory,
		inventoryOrigin: inventoryOrigin(liveInventory, displayInventory),
		health: {
			status: live.status,
			installed: live.installed,
			auth: live.auth,
			checkedAt: live.checkedAt,
			errorKind: live.errorKind ?? null,
			message,
		},
		healthOrigin: "live",
	};
}

function refreshAgentCapabilityWithState(
	db: HostDb,
	config: RevisionedAgentCapabilityConfig,
	state: CapabilityRefreshState,
	options: {
		now?: number;
		probe?: CapabilityProbe;
	} = {},
): Promise<AgentCapabilityView> {
	if (state.disposed) {
		return Promise.reject(new AgentCapabilityProbeAbortedError());
	}
	const now = options.now ?? Date.now();
	const previous = listCapabilitySnapshots(db, {
		now,
		agentId: config.id,
		includeHiddenInventory: true,
	})[0];
	const key = refreshKey(config);
	const existing = state.refreshInFlight.get(key);
	if (existing) return existing;
	const refresh = refreshCapabilityUncoalesced(
		db,
		config,
		previous,
		now,
		options.probe ?? inspectAgentCapability,
		state.abortController.signal,
	).finally(() => {
		if (state.refreshInFlight.get(key) === refresh) {
			state.refreshInFlight.delete(key);
		}
	});
	state.refreshInFlight.set(key, refresh);
	return refresh;
}

async function refreshAgentCapabilitiesWithState(
	db: HostDb,
	configs: RevisionedAgentCapabilityConfig[],
	state: CapabilityRefreshState,
	options: {
		now?: number;
		concurrency?: number;
		probe?: CapabilityProbe;
	} = {},
): Promise<AgentCapabilityView[]> {
	const results = new Array<AgentCapabilityView>(configs.length);
	let nextIndex = 0;
	const concurrency = Math.max(
		1,
		Math.min(
			options.concurrency ?? CAPABILITY_REFRESH_CONCURRENCY,
			configs.length,
		),
	);
	async function worker(): Promise<void> {
		while (nextIndex < configs.length) {
			const resultIndex = nextIndex;
			nextIndex += 1;
			const config = configs[resultIndex];
			if (!config) continue;
			try {
				results[resultIndex] = await refreshAgentCapabilityWithState(
					db,
					config,
					state,
					{
						now: options.now,
						probe: options.probe,
					},
				);
			} catch (error) {
				if (
					state.disposed ||
					state.abortController.signal.aborted ||
					error instanceof AgentCapabilityProbeAbortedError ||
					error instanceof ObsoleteCapabilityRefreshError
				) {
					throw error;
				}
				const previous = listCapabilitySnapshots(db, {
					now: options.now,
					agentId: config.id,
					includeHiddenInventory: true,
				})[0];
				results[resultIndex] = isolatedProcessFailureView(
					config,
					previous,
					options.now ?? Date.now(),
				);
			}
		}
	}
	await Promise.all(Array.from({ length: concurrency }, () => worker()));
	return results;
}

export class CapabilityRefreshService {
	readonly #state = createCapabilityRefreshState();

	constructor(readonly db: HostDb) {}

	readPersisted(now = Date.now()): AgentCapabilityView[] {
		return readPersistedCapabilitySnapshots(this.db, now);
	}

	refreshCapability(
		config: RevisionedAgentCapabilityConfig,
		options: { now?: number; probe?: CapabilityProbe } = {},
	): Promise<AgentCapabilityView> {
		return refreshAgentCapabilityWithState(
			this.db,
			config,
			this.#state,
			options,
		);
	}

	refreshCapabilities(
		configs: RevisionedAgentCapabilityConfig[],
		options: {
			now?: number;
			concurrency?: number;
			probe?: CapabilityProbe;
		} = {},
	): Promise<AgentCapabilityView[]> {
		return refreshAgentCapabilitiesWithState(
			this.db,
			configs,
			this.#state,
			options,
		);
	}

	async dispose(): Promise<void> {
		if (this.#state.disposed) return;
		this.#state.disposed = true;
		this.#state.abortController.abort();
		await Promise.allSettled(this.#state.refreshInFlight.values());
		this.#state.refreshInFlight.clear();
	}
}
