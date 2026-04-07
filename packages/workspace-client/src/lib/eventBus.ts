import type {
	ClientMessage,
	ServerMessage,
} from "@superset/host-service/events";
import type { FsWatchEvent } from "@superset/workspace-fs/host";

type EventType = "fs:events" | "git:changed";

interface FsEventsPayload {
	events: FsWatchEvent[];
}

type EventListener<T extends EventType> = T extends "fs:events"
	? (workspaceId: string, payload: FsEventsPayload) => void
	: T extends "git:changed"
		? (workspaceId: string) => void
		: never;

interface ListenerEntry {
	type: EventType;
	workspaceId: string | "*";
	callback: (...args: unknown[]) => void;
}

const RECONNECT_BASE_MS = 1_000;
const RECONNECT_MAX_MS = 30_000;

interface ConnectionState {
	socket: WebSocket | null;
	refCount: number;
	listeners: Set<ListenerEntry>;
	fsWatchedWorkspaces: Map<string, number>;
	reconnectAttempts: number;
	reconnectTimer: ReturnType<typeof setTimeout> | null;
	disposed: boolean;
}

const connections = new Map<string, ConnectionState>();

function buildEventBusUrl(hostUrl: string, wsToken: string | null): string {
	const url = new URL("/events", hostUrl);
	url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
	if (wsToken) {
		url.searchParams.set("token", wsToken);
	}
	return url.toString();
}

function sendCommand(state: ConnectionState, message: ClientMessage): void {
	if (state.socket?.readyState === WebSocket.OPEN) {
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
		console.error("[event-bus-client]", message.message);
		return;
	}

	for (const entry of state.listeners) {
		if (entry.type !== message.type) continue;

		const workspaceId =
			message.type === "fs:events" || message.type === "git:changed"
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
			(entry.callback as EventListener<"git:changed">)(message.workspaceId);
		}
	}
}

function connect(
	state: ConnectionState,
	hostUrl: string,
	getWsToken: () => string | null,
): void {
	if (state.disposed) return;

	const wsUrl = buildEventBusUrl(hostUrl, getWsToken());
	const socket = new WebSocket(wsUrl);
	state.socket = socket;

	socket.onopen = () => {
		state.reconnectAttempts = 0;

		// Re-send all active fs:watch commands
		for (const workspaceId of state.fsWatchedWorkspaces.keys()) {
			sendCommand(state, { type: "fs:watch", workspaceId });
		}
	};

	socket.onmessage = (event) => {
		handleMessage(state, event.data);
	};

	socket.onclose = () => {
		if (state.disposed) return;
		state.socket = null;
		scheduleReconnect(state, hostUrl, getWsToken);
	};

	socket.onerror = () => {
		// onclose will fire after onerror
	};
}

function scheduleReconnect(
	state: ConnectionState,
	hostUrl: string,
	getWsToken: () => string | null,
): void {
	if (state.disposed || state.reconnectTimer) return;

	const delay = Math.min(
		RECONNECT_BASE_MS * 2 ** state.reconnectAttempts,
		RECONNECT_MAX_MS,
	);
	state.reconnectAttempts++;

	state.reconnectTimer = setTimeout(() => {
		state.reconnectTimer = null;
		if (!state.disposed) {
			connect(state, hostUrl, getWsToken);
		}
	}, delay);
}

function getOrCreateConnection(
	hostUrl: string,
	getWsToken: () => string | null,
): ConnectionState {
	const key = hostUrl;
	const existing = connections.get(key);
	if (existing) return existing;

	const state: ConnectionState = {
		socket: null,
		refCount: 0,
		listeners: new Set(),
		fsWatchedWorkspaces: new Map(),
		reconnectAttempts: 0,
		reconnectTimer: null,
		disposed: false,
	};
	connections.set(key, state);
	connect(state, hostUrl, getWsToken);
	return state;
}

function maybeCleanupConnection(hostUrl: string): void {
	const key = hostUrl;
	const state = connections.get(key);
	if (!state) return;

	if (state.refCount > 0 || state.listeners.size > 0) return;

	state.disposed = true;
	if (state.reconnectTimer) {
		clearTimeout(state.reconnectTimer);
		state.reconnectTimer = null;
	}
	if (
		state.socket?.readyState === WebSocket.CONNECTING ||
		state.socket?.readyState === WebSocket.OPEN
	) {
		state.socket.close(1000, "No more subscribers");
	}
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
