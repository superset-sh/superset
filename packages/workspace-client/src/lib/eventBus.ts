import type {
	AgentLifecycleEventType,
	ClientMessage,
	ServerMessage,
} from "@superset/host-service/events";
import type { AgentIdentity } from "@superset/shared/agent-identity";
import { DIAL_TIMEOUT_MS } from "@superset/shared/tunnel-protocol";
import type { FsWatchEvent } from "@superset/workspace-fs/host";
import type { RelayHostProbe } from "./probeRelayHost";
import { createRelaySocket, type RelaySocket } from "./relaySocket";

export type { AgentIdentity };

type EventType =
	| "fs:events"
	| "git:changed"
	| "agent:lifecycle"
	| "agent:bindings-changed"
	| "terminal:lifecycle"
	| "port:changed"
	| "workspace:changed"
	| "workspace:create-settled"
	| "project:changed"
	| "tag-folders:changed"
	| "page-watch:changed";

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

export interface AgentBindingsChangedPayload {
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

type WorkspaceCreateSettledMessage = Extract<
	ServerMessage,
	{ type: "workspace:create-settled" }
>;

export type WorkspaceCreateSettledPayload = Omit<
	WorkspaceCreateSettledMessage,
	"type" | "workspaceId"
>;

type ProjectChangedMessage = Extract<
	ServerMessage,
	{ type: "project:changed" }
>;

export type ProjectSnapshotPayload = NonNullable<
	ProjectChangedMessage["project"]
>;

export interface ProjectChangedPayload {
	eventType: ProjectChangedMessage["eventType"];
	/** Null for `deleted` — the row is already gone. */
	project: ProjectChangedMessage["project"];
	occurredAt: number;
}

export interface PageWatchChangedPayload {
	occurredAt: number;
}

type TagFoldersChangedMessage = Extract<
	ServerMessage,
	{ type: "tag-folders:changed" }
>;

export interface TagFoldersChangedPayload {
	/** The scope's full set after the change — empty when all were removed. */
	settings: TagFoldersChangedMessage["settings"];
	occurredAt: TagFoldersChangedMessage["occurredAt"];
}

type EventListener<T extends EventType> = T extends "fs:events"
	? (workspaceId: string, payload: FsEventsPayload) => void
	: T extends "git:changed"
		? (workspaceId: string, payload: GitChangedPayload) => void
		: T extends "agent:lifecycle"
			? (workspaceId: string, payload: AgentLifecyclePayload) => void
			: T extends "agent:bindings-changed"
				? (workspaceId: string, payload: AgentBindingsChangedPayload) => void
				: T extends "terminal:lifecycle"
					? (workspaceId: string, payload: TerminalLifecyclePayload) => void
					: T extends "port:changed"
						? (workspaceId: string, payload: PortChangedPayload) => void
						: T extends "workspace:changed"
							? (workspaceId: string, payload: WorkspaceChangedPayload) => void
							: T extends "workspace:create-settled"
								? (
										workspaceId: string,
										payload: WorkspaceCreateSettledPayload,
									) => void
								: T extends "project:changed"
									? (projectId: string, payload: ProjectChangedPayload) => void
									: T extends "tag-folders:changed"
										? (scope: string, payload: TagFoldersChangedPayload) => void
										: T extends "page-watch:changed"
											? (
													workspaceId: string,
													payload: PageWatchChangedPayload,
												) => void
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

export type HostConnectionState =
	| "connecting"
	| "open"
	| "reconnecting"
	| "closed";

export interface HostConnectionStatus {
	state: HostConnectionState;
	/** Timestamp of the last transition into `state`. */
	since: number;
	/**
	 * Last `_whoowns` preflight result: 503 host not connected to the relay,
	 * 401/403 unauthorized, null for a direct (non-relay) host URL or when the
	 * relay itself couldn't be reached. Names *why* the socket is down.
	 */
	probe: RelayHostProbe | null;
}

type ConnectionStatusListener = (status: HostConnectionStatus) => void;

interface ConnectionState {
	socket: RelaySocket;
	refCount: number;
	listeners: Set<ListenerEntry>;
	fsWatchedWorkspaces: Map<string, number>;
	/** Refcounted per-file watches, keyed `${workspaceId}\0${absolutePath}`. */
	fsWatchedFiles: Map<string, number>;
	/** Replaced, never mutated, so `useSyncExternalStore` snapshots stay stable. */
	status: HostConnectionStatus;
	statusListeners: Set<ConnectionStatusListener>;
}

function fileWatchKey(workspaceId: string, absolutePath: string): string {
	return `${workspaceId}\0${absolutePath}`;
}

function probesEqual(
	left: RelayHostProbe | null,
	right: RelayHostProbe | null,
): boolean {
	if (left === right) return true;
	if (left === null || right === null) return false;
	return left.status === right.status;
}

function setConnectionStatus(
	state: ConnectionState,
	next: { state?: HostConnectionState; probe?: RelayHostProbe | null },
): void {
	const current = state.status;
	const nextState = next.state ?? current.state;
	const nextProbe = "probe" in next ? (next.probe ?? null) : current.probe;
	// Value-compare probes: the preflight allocates a fresh result object per
	// dial, so identity comparison republished an unchanged 503 on every
	// backoff attempt — fanning a no-op "transition" out to every status
	// subscriber (and their React commits) for as long as a host stayed down.
	if (nextState === current.state && probesEqual(nextProbe, current.probe)) {
		return;
	}

	state.status = {
		state: nextState,
		since: nextState === current.state ? current.since : Date.now(),
		// Keep the old probe object when only the state moved, so subscribers
		// keying on probe identity don't re-derive from an equal value.
		probe: probesEqual(nextProbe, current.probe) ? current.probe : nextProbe,
	};
	for (const listener of state.statusListeners) listener(state.status);
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

		// Scope id for per-entity filtering: workspaceId for workspace-scoped
		// events, projectId for project:changed ("*" subscribers get all).
		const workspaceId =
			message.type === "fs:events" ||
			message.type === "git:changed" ||
			message.type === "agent:lifecycle" ||
			message.type === "agent:bindings-changed" ||
			message.type === "terminal:lifecycle" ||
			message.type === "port:changed" ||
			message.type === "workspace:changed" ||
			message.type === "workspace:create-settled" ||
			message.type === "page-watch:changed"
				? message.workspaceId
				: message.type === "project:changed"
					? message.projectId
					: message.type === "tag-folders:changed"
						? message.scope
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
		} else if (message.type === "agent:bindings-changed") {
			(entry.callback as EventListener<"agent:bindings-changed">)(
				message.workspaceId,
				{ occurredAt: message.occurredAt },
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
		} else if (message.type === "page-watch:changed") {
			(entry.callback as EventListener<"page-watch:changed">)(
				message.workspaceId,
				{ occurredAt: message.occurredAt },
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
		} else if (message.type === "workspace:create-settled") {
			const { type: _type, workspaceId: _workspaceId, ...payload } = message;
			(entry.callback as EventListener<"workspace:create-settled">)(
				message.workspaceId,
				payload,
			);
		} else if (message.type === "project:changed") {
			(entry.callback as EventListener<"project:changed">)(message.projectId, {
				eventType: message.eventType,
				project: message.project,
				occurredAt: message.occurredAt,
			});
		} else if (message.type === "tag-folders:changed") {
			(entry.callback as EventListener<"tag-folders:changed">)(message.scope, {
				settings: message.settings,
				occurredAt: message.occurredAt,
			});
		}
	}
}

function getOrCreateConnection(
	hostUrl: string,
	getWsToken: () => string | null,
	getUrlParams?: () => Record<string, string> | null,
): ConnectionState {
	const key = hostUrl;
	const existing = connections.get(key);
	if (existing) return existing;

	// createRelaySocket runs the host probe and re-signs the URL
	// with a fresh token before every attempt; backoff and reconnection live
	// inside partysocket. Buffering is disabled so command semantics stay
	// "send only while open" — watches are replayed from state on each open.
	const socket = createRelaySocket({
		// Params are read per attempt, not captured: a sandbox's edge token
		// expires, and the connection outlives any single one.
		buildUrl: () => {
			const url = new URL(`${hostUrl.replace(/\/$/, "")}/events`);
			for (const [key, value] of Object.entries(getUrlParams?.() ?? {})) {
				url.searchParams.set(key, value);
			}
			return url.toString();
		},
		getToken: getWsToken,
		accessDeniedRetryMs: ACCESS_DENIED_RETRY_MS,
		minReconnectionDelay: RECONNECT_BASE_MS,
		maxReconnectionDelay: RECONNECT_MAX_MS,
		// Relay upgrades wait for the host's dial-back (DIAL_TIMEOUT_MS);
		// partysocket's 4s default gave up on attempts the host was answering.
		connectionTimeout: DIAL_TIMEOUT_MS + 2_000,
		maxEnqueuedMessages: 0,
		onProbe: (probe) => {
			setConnectionStatus(state, { probe });
		},
	});

	const state: ConnectionState = {
		socket,
		refCount: 0,
		listeners: new Set(),
		fsWatchedWorkspaces: new Map(),
		fsWatchedFiles: new Map(),
		status: { state: "connecting", since: Date.now(), probe: null },
		statusListeners: new Set(),
	};

	socket.addEventListener("close", () => {
		// partysocket keeps dialling on its own backoff unless the close was
		// terminal (explicit close, retries exhausted), so "reconnecting" is the
		// normal outcome here — the socket is still working toward a connection.
		setConnectionStatus(state, {
			state: socket.shouldReconnect ? "reconnecting" : "closed",
		});
	});
	socket.addEventListener("open", () => {
		setConnectionStatus(state, { state: "open" });

		// Re-send all active fs:watch commands
		for (const workspaceId of state.fsWatchedWorkspaces.keys()) {
			sendCommand(state, { type: "fs:watch", workspaceId });
		}
		for (const key of state.fsWatchedFiles.keys()) {
			const [workspaceId, absolutePath] = key.split("\0");
			if (workspaceId && absolutePath) {
				sendCommand(state, {
					type: "fs:watch-file",
					workspaceId,
					absolutePath,
				});
			}
		}
	});
	socket.addEventListener("message", (event) => {
		handleMessage(state, event.data);
	});

	connections.set(key, state);
	return state;
}

/**
 * Dial the existing connection for `hostUrl` now, if there is one and it
 * isn't open. For the moment a client learns the host's endpoint or
 * credentials changed (a host-service restart handing out a fresh port or
 * secret): the socket may be mid-backoff, or its last dial may have lost the
 * race against the credential update and been auth-rejected — either way the
 * next scheduled attempt is seconds out, and this collapses that wait.
 * Deliberately never creates a connection: with no established consumers
 * there is nothing to recover.
 */
export function reconnectEventBusIfDown(hostUrl: string): void {
	const state = connections.get(hostUrl);
	if (!state || state.status.state === "open") return;
	state.socket.reconnect(1000, "endpoint or credentials refreshed");
	setConnectionStatus(state, { state: "connecting" });
}

function maybeCleanupConnection(hostUrl: string): void {
	const key = hostUrl;
	const state = connections.get(key);
	if (!state) return;

	if (
		state.refCount > 0 ||
		state.listeners.size > 0 ||
		state.statusListeners.size > 0
	) {
		return;
	}

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
	/**
	 * Declare one open file so the host can install a targeted watch when the
	 * recursive workspace watcher doesn't cover it (gitignored build dirs,
	 * node_modules, nested repos). Events arrive as regular `fs:events`.
	 */
	watchFsFile(workspaceId: string, absolutePath: string): void;
	unwatchFsFile(workspaceId: string, absolutePath: string): void;
	retain(): () => void;
	/** Live reachability of this host, as observed on the real data path. */
	getConnectionStatus(): HostConnectionStatus;
	subscribeConnectionStatus(listener: ConnectionStatusListener): () => void;
	/** Dial now instead of waiting out the backoff (retry buttons). */
	reconnect(): void;
}

/**
 * Get a handle to the event bus for a given host.
 * One WS connection is shared across all handles for the same hostUrl.
 */
export function getEventBus(
	hostUrl: string,
	getWsToken: () => string | null,
	/**
	 * Extra query params for the socket URL. A browser can't set headers on a
	 * WebSocket upgrade, so a host fronted by a gateway that authenticates on
	 * one (a cloud workspace sandbox) has to pass it here instead.
	 */
	getUrlParams?: () => Record<string, string> | null,
): EventBusHandle {
	const state = getOrCreateConnection(hostUrl, getWsToken, getUrlParams);

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

		watchFsFile(workspaceId: string, absolutePath: string): void {
			const key = fileWatchKey(workspaceId, absolutePath);
			const count = state.fsWatchedFiles.get(key) ?? 0;
			state.fsWatchedFiles.set(key, count + 1);
			if (count === 0) {
				sendCommand(state, {
					type: "fs:watch-file",
					workspaceId,
					absolutePath,
				});
			}
		},

		unwatchFsFile(workspaceId: string, absolutePath: string): void {
			const key = fileWatchKey(workspaceId, absolutePath);
			const count = state.fsWatchedFiles.get(key) ?? 0;
			if (count <= 1) {
				state.fsWatchedFiles.delete(key);
				sendCommand(state, {
					type: "fs:unwatch-file",
					workspaceId,
					absolutePath,
				});
			} else {
				state.fsWatchedFiles.set(key, count - 1);
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

		getConnectionStatus(): HostConnectionStatus {
			return state.status;
		},

		subscribeConnectionStatus(listener: ConnectionStatusListener): () => void {
			state.statusListeners.add(listener);
			return () => {
				state.statusListeners.delete(listener);
				maybeCleanupConnection(hostUrl);
			};
		},

		reconnect(): void {
			// The synthetic close partysocket dispatches lands first, so publish
			// "connecting" after it — otherwise the retry reads as a fresh failure.
			state.socket.reconnect(1000, "manual reconnect");
			setConnectionStatus(state, { state: "connecting" });
		},
	};
}
