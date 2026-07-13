import type {
	AgentLifecycleEventType,
	ClientMessage,
	ServerMessage,
} from "@superset/host-service/events";
import type { AgentIdentity } from "@superset/shared/agent-identity";
import type { FsWatchEvent } from "@superset/workspace-fs/host";
import { createRelaySocket, type RelaySocket } from "./relaySocket";

export type { AgentIdentity };

type EventType =
	| "fs:events"
	| "git:changed"
	| "agent:lifecycle"
	| "terminal:lifecycle"
	| "port:changed"
	| "workspace:changed";

interface FsEventsPayload {
	events: FsWatchEvent[];
}

export interface GitChangedPayload {
	/**
	 * Worktree-relative paths when the event was worktree-only. Absent for
	 * broad state changes (`.git/` activity) — treat as "invalidate everything".
	 */
	paths?: string[];
}

export interface AgentLifecyclePayload {
	eventType: AgentLifecycleEventType;
	terminalId: string;
	// Absent when the hook ran without `SUPERSET_AGENT_ID` set.
	agent?: AgentIdentity;
	occurredAt: number;
}

export interface TerminalLifecyclePayload {
	eventType: "exit";
	terminalId: string;
	exitCode: number;
	signal: number;
	occurredAt: number;
}

type PortChangedMessage = Extract<ServerMessage, { type: "port:changed" }>;

export interface PortChangedPayload {
	eventType: PortChangedMessage["eventType"];
	port: PortChangedMessage["port"];
	label: PortChangedMessage["label"];
	occurredAt: number;
}

type WorkspaceChangedMessage = Extract<
	ServerMessage,
	{ type: "workspace:changed" }
>;

export type WorkspaceSnapshotPayload = NonNullable<
	WorkspaceChangedMessage["workspace"]
>;

export interface WorkspaceChangedPayload {
	eventType: WorkspaceChangedMessage["eventType"];
	/** Null for `deleted` — the row is already gone. */
	workspace: WorkspaceChangedMessage["workspace"];
	occurredAt: number;
}

type EventListener<T extends EventType> = T extends "fs:events"
	? (workspaceId: string, payload: FsEventsPayload) => void
	: T extends "git:changed"
		? (workspaceId: string, payload: GitChangedPayload) => void
		: T extends "agent:lifecycle"
			? (workspaceId: string, payload: AgentLifecyclePayload) => void
			: T extends "terminal:lifecycle"
				? (workspaceId: string, payload: TerminalLifecyclePayload) => void
				: T extends "port:changed"
					? (workspaceId: string, payload: PortChangedPayload) => void
					: T extends "workspace:changed"
						? (workspaceId: string, payload: WorkspaceChangedPayload) => void
						: never;

interface ListenerEntry {
	type: EventType;
	workspaceId: string | "*";
	callback: (...args: unknown[]) => void;
}

const RECONNECT_BASE_MS = 1_000;
const RECONNECT_MAX_MS = 30_000;
// Definitive access denial (preflight 403): the relay will keep saying no, so
// exponential 1-30s retries just hammer it. Poll slowly instead of stopping
// outright so access granted later (host sharing) is picked up eventually.
const ACCESS_DENIED_RETRY_MS = 5 * 60_000;

interface ConnectionState {
	socket: RelaySocket;
	refCount: number;
	listeners: Set<ListenerEntry>;
	fsWatchedWorkspaces: Map<string, number>;
}

const connections = new Map<string, ConnectionState>();

function sendCommand(state: ConnectionState, message: ClientMessage): void {
	if (state.socket.readyState === WebSocket.OPEN) {
		state.socket.send(JSON.stringify(message));
	}
}

function handleMessage(state: ConnectionState, data: unknown): void {
	let message: ServerMessage;
	try {
		message = JSON.parse(String(data)) as ServerMessage;
	} catch {
		return;
	}

	if (message.type === "error") {
		// Server-side bus errors aren't actionable from the client; the
		// reconnect loop already handles transient failures, and logging
		// here just floods the console when a host bounces offline.
		return;
	}

	for (const entry of state.listeners) {
		if (entry.type !== message.type) continue;

		const workspaceId =
			message.type === "fs:events" ||
			message.type === "git:changed" ||
			message.type === "agent:lifecycle" ||
			message.type === "terminal:lifecycle" ||
			message.type === "port:changed" ||
			message.type === "workspace:changed"
				? message.workspaceId
				: null;

		if (
			workspaceId &&
			entry.workspaceId !== "*" &&
			entry.workspaceId !== workspaceId
		) {
			continue;
		}

		if (message.type === "fs:events") {
			(entry.callback as EventListener<"fs:events">)(message.workspaceId, {
				events: message.events,
			});
		} else if (message.type === "git:changed") {
			(entry.callback as EventListener<"git:changed">)(message.workspaceId, {
				paths: message.paths,
			});
		} else if (message.type === "agent:lifecycle") {
			(entry.callback as EventListener<"agent:lifecycle">)(
				message.workspaceId,
				{
					eventType: message.eventType,
					terminalId: message.terminalId,
					...(message.agent ? { agent: message.agent } : {}),
					occurredAt: message.occurredAt,
				},
			);
		} else if (message.type === "terminal:lifecycle") {
			(entry.callback as EventListener<"terminal:lifecycle">)(
				message.workspaceId,
				{
					eventType: message.eventType,
					terminalId: message.terminalId,
					exitCode: message.exitCode,
					signal: message.signal,
					occurredAt: message.occurredAt,
				},
			);
		} else if (message.type === "port:changed") {
			(entry.callback as EventListener<"port:changed">)(message.workspaceId, {
				eventType: message.eventType,
				port: message.port,
				label: message.label,
				occurredAt: message.occurredAt,
			});
		} else if (message.type === "workspace:changed") {
			(entry.callback as EventListener<"workspace:changed">)(
				message.workspaceId,
				{
					eventType: message.eventType,
					workspace: message.workspace,
					occurredAt: message.occurredAt,
				},
			);
		}
	}
}

function getOrCreateConnection(
	hostUrl: string,
	getWsToken: () => string | null,
): ConnectionState {
	const key = hostUrl;
	const existing = connections.get(key);
	if (existing) return existing;

	// createRelaySocket runs the fly-affinity preflight and re-signs the URL
	// with a fresh token before every attempt; backoff and reconnection live
	// inside partysocket. Buffering is disabled so command semantics stay
	// "send only while open" — watches are replayed from state on each open.
	const socket = createRelaySocket({
		name: "event-bus",
		buildUrl: () => `${hostUrl.replace(/\/$/, "")}/events`,
		getToken: getWsToken,
		accessDeniedRetryMs: ACCESS_DENIED_RETRY_MS,
		minReconnectionDelay: RECONNECT_BASE_MS,
		maxReconnectionDelay: RECONNECT_MAX_MS,
		maxEnqueuedMessages: 0,
	});

	const state: ConnectionState = {
		socket,
		refCount: 0,
		listeners: new Set(),
		fsWatchedWorkspaces: new Map(),
	};

	socket.addEventListener("open", () => {
		// Re-send all active fs:watch commands
		for (const workspaceId of state.fsWatchedWorkspaces.keys()) {
			sendCommand(state, { type: "fs:watch", workspaceId });
		}
	});
	socket.addEventListener("message", (event) => {
		handleMessage(state, event.data);
	});

	connections.set(key, state);
	return state;
}

function maybeCleanupConnection(hostUrl: string): void {
	const key = hostUrl;
	const state = connections.get(key);
	if (!state) return;

	if (state.refCount > 0 || state.listeners.size > 0) return;

	state.socket.close(1000, "No more subscribers");
	connections.delete(key);
}

// ── Public API ─────────────────────────────────────────────────────

export interface EventBusHandle {
	on<T extends EventType>(
		type: T,
		workspaceId: string | "*",
		listener: EventListener<T>,
	): () => void;
	watchFs(workspaceId: string): void;
	unwatchFs(workspaceId: string): void;
	retain(): () => void;
}

/**
 * Get a handle to the event bus for a given host.
 * One WS connection is shared across all handles for the same hostUrl.
 */
export function getEventBus(
	hostUrl: string,
	getWsToken: () => string | null,
): EventBusHandle {
	const state = getOrCreateConnection(hostUrl, getWsToken);

	return {
		on<T extends EventType>(
			type: T,
			workspaceId: string | "*",
			listener: EventListener<T>,
		): () => void {
			const entry: ListenerEntry = {
				type,
				workspaceId,
				callback: listener as (...args: unknown[]) => void,
			};
			state.listeners.add(entry);

			return () => {
				state.listeners.delete(entry);
				maybeCleanupConnection(hostUrl);
			};
		},

		watchFs(workspaceId: string): void {
			const count = state.fsWatchedWorkspaces.get(workspaceId) ?? 0;
			state.fsWatchedWorkspaces.set(workspaceId, count + 1);
			if (count === 0) {
				sendCommand(state, { type: "fs:watch", workspaceId });
			}
		},

		unwatchFs(workspaceId: string): void {
			const count = state.fsWatchedWorkspaces.get(workspaceId) ?? 0;
			if (count <= 1) {
				state.fsWatchedWorkspaces.delete(workspaceId);
				sendCommand(state, { type: "fs:unwatch", workspaceId });
			} else {
				state.fsWatchedWorkspaces.set(workspaceId, count - 1);
			}
		},

		/**
		 * Increment ref count to keep the connection alive even without listeners.
		 * Returns a release function.
		 */
		retain(): () => void {
			state.refCount++;
			return () => {
				state.refCount = Math.max(0, state.refCount - 1);
				maybeCleanupConnection(hostUrl);
			};
		},
	};
}
