import path from "node:path";
import type { NodeWebSocket } from "@hono/node-ws";
import type { DetectedPort } from "@superset/port-scanner";
import {
	type FsWatchEvent,
	watchSingleFile,
} from "@superset/workspace-fs/host";
import type { Hono } from "hono";
import type { HostDb } from "../db/index.ts";
import { portManager } from "../ports/port-manager.ts";
import { getLabelsForWorkspace } from "../ports/static-ports.ts";
import type { WorkspaceFilesystemManager } from "../runtime/filesystem/index.ts";
import type { GitWatcher } from "./git-watcher.ts";
import type { ClientMessage, ServerMessage } from "./types.ts";

type WsSocket = {
	send: (data: string) => void;
	readyState: number;
	close: (code?: number, reason?: string) => void;
};

interface FsSubscription {
	workspaceId: string;
	dispose: () => void;
}

interface ClientState {
	fsSubscriptions: Map<string, FsSubscription>;
	/** Targeted per-file watches, keyed `${workspaceId}\0${absolutePath}`. */
	fileWatches: Map<string, () => void>;
	/** Workspaces this client currently holds a `GitWatcher` interest count for. */
	gitSubscriptions: Set<string>;
}

/** Open documents per client are bounded by open panes; this is a leak stop. */
const MAX_FILE_WATCHES_PER_CLIENT = 256;

/**
 * Generous enough that a heavy user's sidebar (every non-archived workspace,
 * observed in the hundreds — see #6729) never hits it; still a real ceiling
 * against a buggy or adversarial client spamming `git:watch` with distinct
 * workspaceIds, each of which costs GitWatcher a synchronous DB lookup.
 */
export const MAX_GIT_WATCHES_PER_CLIENT = 2000;

type WorkspaceChangedListener = (
	message: Omit<Extract<ServerMessage, { type: "workspace:changed" }>, "type">,
) => void;

type TerminalLifecycleListener = (
	message: Omit<Extract<ServerMessage, { type: "terminal:lifecycle" }>, "type">,
) => void;

function sendMessage(socket: WsSocket, message: ServerMessage): void {
	if (socket.readyState !== 1) return;
	socket.send(JSON.stringify(message));
}

function parseClientMessage(data: unknown): ClientMessage | null {
	try {
		const raw = typeof data === "string" ? data : String(data);
		const parsed = JSON.parse(raw);
		if (
			parsed &&
			typeof parsed === "object" &&
			typeof parsed.type === "string" &&
			typeof parsed.workspaceId === "string"
		) {
			if (
				parsed.type === "fs:watch" ||
				parsed.type === "fs:unwatch" ||
				parsed.type === "git:watch" ||
				parsed.type === "git:unwatch"
			) {
				return parsed as ClientMessage;
			}
			if (
				(parsed.type === "fs:watch-file" ||
					parsed.type === "fs:unwatch-file") &&
				typeof parsed.absolutePath === "string"
			) {
				return parsed as ClientMessage;
			}
		}
	} catch (error) {
		console.warn("[event-bus] malformed client message — ignored", { error });
	}
	return null;
}

export interface EventBusOptions {
	db: HostDb;
	filesystem: WorkspaceFilesystemManager;
	gitWatcher: GitWatcher;
}

/**
 * Unified WebSocket event bus for the host-service.
 *
 * One connection per client. Carries:
 * - `git:changed` events (on-demand per client `git:watch`/`git:unwatch` —
 *   drives `GitWatcher`'s refcounted registration, see #6729)
 * - `port:changed` events (auto-pushed for all workspace terminals)
 * - `fs:events` (on-demand per client request)
 */
export class EventBus {
	private readonly clients = new Map<WsSocket, ClientState>();
	private readonly workspaceChangedListeners =
		new Set<WorkspaceChangedListener>();
	private readonly terminalLifecycleListeners =
		new Set<TerminalLifecycleListener>();
	private readonly gitWatcher: GitWatcher;
	private readonly filesystem: WorkspaceFilesystemManager;
	private removeGitListener: (() => void) | null = null;
	private removePortListeners: (() => void) | null = null;

	constructor(options: EventBusOptions) {
		this.filesystem = options.filesystem;
		this.gitWatcher = options.gitWatcher;
	}

	start(): void {
		if (this.removeGitListener || this.removePortListeners) return;

		this.removeGitListener = this.gitWatcher.onChanged((event) => {
			this.broadcast({
				type: "git:changed",
				workspaceId: event.workspaceId,
				...(event.paths !== undefined ? { paths: event.paths } : {}),
			});
		});

		const handlePortAdd = (port: DetectedPort) => {
			this.broadcastPortChanged({ eventType: "add", port });
		};
		const handlePortRemove = (port: DetectedPort) => {
			this.broadcastPortChanged({ eventType: "remove", port });
		};
		portManager.on("port:add", handlePortAdd);
		portManager.on("port:remove", handlePortRemove);
		this.removePortListeners = () => {
			portManager.off("port:add", handlePortAdd);
			portManager.off("port:remove", handlePortRemove);
		};
	}

	close(): void {
		this.removeGitListener?.();
		this.removeGitListener = null;
		this.removePortListeners?.();
		this.removePortListeners = null;
		for (const [socket, state] of this.clients) {
			this.cleanupClient(socket, state);
		}
		this.clients.clear();
	}

	handleOpen(socket: WsSocket): void {
		this.clients.set(socket, {
			fsSubscriptions: new Map(),
			fileWatches: new Map(),
			gitSubscriptions: new Set(),
		});
	}

	handleMessage(socket: WsSocket, data: unknown): void {
		const state = this.clients.get(socket);
		if (!state) return;

		const message = parseClientMessage(data);
		if (!message) return;

		if (message.type === "fs:watch") {
			this.startFsWatch(socket, state, message.workspaceId);
		} else if (message.type === "fs:unwatch") {
			this.stopFsWatch(state, message.workspaceId);
		} else if (message.type === "fs:watch-file") {
			this.startFsFileWatch(
				socket,
				state,
				message.workspaceId,
				message.absolutePath,
			);
		} else if (message.type === "fs:unwatch-file") {
			this.stopFsFileWatch(state, message.workspaceId, message.absolutePath);
		} else if (message.type === "git:watch") {
			this.startGitWatch(socket, state, message.workspaceId);
		} else if (message.type === "git:unwatch") {
			this.stopGitWatch(state, message.workspaceId);
		}
	}

	handleClose(socket: WsSocket): void {
		const state = this.clients.get(socket);
		if (state) {
			this.cleanupClient(socket, state);
			this.clients.delete(socket);
		}
	}

	private broadcast(message: ServerMessage): void {
		// One bad socket must not block fan-out to the rest. Drop dead sockets
		// rather than logging on every broadcast forever.
		const dead: WsSocket[] = [];
		for (const socket of this.clients.keys()) {
			try {
				sendMessage(socket, message);
			} catch (error) {
				console.error("[event-bus:send] socket failed — dropping", { error });
				dead.push(socket);
			}
		}
		for (const socket of dead) {
			const state = this.clients.get(socket);
			if (state) this.cleanupClient(socket, state);
			this.clients.delete(socket);
		}
	}

	/**
	 * Fan out an agent lifecycle event (hook completion) to all connected
	 * clients. The workspace-client filters by `workspaceId` on the receiving
	 * side; we broadcast indiscriminately here to match the existing
	 * `git:changed` pattern.
	 */
	broadcastAgentLifecycle(
		message: Omit<Extract<ServerMessage, { type: "agent:lifecycle" }>, "type">,
	): void {
		this.broadcast({ type: "agent:lifecycle", ...message });
	}

	/**
	 * Fan out binding mutations that are not lifecycle hooks. Renderers refetch
	 * status from the host, but notification controllers do not treat this as an
	 * agent completion event.
	 */
	broadcastAgentBindingsChanged(
		message: Omit<
			Extract<ServerMessage, { type: "agent:bindings-changed" }>,
			"type"
		>,
	): void {
		this.broadcast({ type: "agent:bindings-changed", ...message });
	}

	/**
	 * Fan out terminal process lifecycle events to renderer clients. Agent hook
	 * status can otherwise get stuck when a terminal exits while its pane is not
	 * mounted and therefore cannot observe the terminal websocket `exit` packet.
	 */
	broadcastTerminalLifecycle(
		message: Omit<
			Extract<ServerMessage, { type: "terminal:lifecycle" }>,
			"type"
		>,
	): void {
		for (const listener of this.terminalLifecycleListeners) {
			try {
				listener(message);
			} catch (error) {
				console.error("[event-bus] terminal-lifecycle listener failed", {
					error,
				});
			}
		}
		this.broadcast({ type: "terminal:lifecycle", ...message });
	}

	onTerminalLifecycle(listener: TerminalLifecycleListener): () => void {
		this.terminalLifecycleListeners.add(listener);
		return () => this.terminalLifecycleListeners.delete(listener);
	}

	broadcastPageWatchChanged(
		message: Omit<
			Extract<ServerMessage, { type: "page-watch:changed" }>,
			"type"
		>,
	): void {
		this.broadcast({ type: "page-watch:changed", ...message });
	}

	/**
	 * Fan out workspace lifecycle changes (create/rename/delete) from the
	 * host-owned workspaces table. Broadcast to all clients — list consumers
	 * subscribe host-wide rather than per-workspace.
	 */
	broadcastWorkspaceChanged(
		message: Omit<
			Extract<ServerMessage, { type: "workspace:changed" }>,
			"type"
		>,
	): void {
		// A throwing listener must not fail the emitting store write or skip
		// the client broadcast.
		for (const listener of this.workspaceChangedListeners) {
			try {
				listener(message);
			} catch (error) {
				console.error("[event-bus] workspace-changed listener failed", {
					error,
				});
			}
		}
		this.broadcast({ type: "workspace:changed", ...message });
	}

	/**
	 * In-process subscription to the same workspace lifecycle events that
	 * `broadcastWorkspaceChanged` fans out to WebSocket clients. For host-
	 * internal consumers (e.g. the pull-requests runtime) that need to react
	 * without holding a socket. Returns an unsubscribe function.
	 */
	onWorkspaceChanged(listener: WorkspaceChangedListener): () => void {
		this.workspaceChangedListeners.add(listener);
		return () => this.workspaceChangedListeners.delete(listener);
	}

	/**
	 * Terminal event for an enqueued workspaces.createEnqueued call — carries
	 * what the synchronous create response used to (canonical id + launched
	 * terminals/agents), keyed by the client-minted enqueue id.
	 */
	broadcastWorkspaceCreateSettled(
		message: Omit<
			Extract<ServerMessage, { type: "workspace:create-settled" }>,
			"type"
		>,
	): void {
		this.broadcast({ type: "workspace:create-settled", ...message });
	}

	/**
	 * Fan out project lifecycle changes (create/rename/delete) from the
	 * host-owned projects table. Broadcast to all clients — list consumers
	 * subscribe host-wide rather than per-workspace.
	 */
	broadcastProjectChanged(
		message: Omit<Extract<ServerMessage, { type: "project:changed" }>, "type">,
	): void {
		this.broadcast({ type: "project:changed", ...message });
	}

	/**
	 * Fan out tag-folder presentation changes for one scope (a project id, or
	 * the Sessions lane). Its own channel rather than a field on the project
	 * snapshot: the Sessions lane has no project to carry it.
	 */
	broadcastTagFoldersChanged(
		message: Omit<
			Extract<ServerMessage, { type: "tag-folders:changed" }>,
			"type"
		>,
	): void {
		this.broadcast({ type: "tag-folders:changed", ...message });
	}

	/**
	 * Fan out port add/remove events discovered by the host-service scanner.
	 * Renderer clients use this to patch their host snapshot immediately while
	 * keeping a slow refetch as a reconnect fallback.
	 */
	private broadcastPortChanged({
		eventType,
		port,
	}: {
		eventType: "add" | "remove";
		port: DetectedPort;
	}): void {
		this.broadcast({
			type: "port:changed",
			workspaceId: port.workspaceId,
			eventType,
			port,
			label: eventType === "add" ? this.getPortLabel(port) : null,
			occurredAt: Date.now(),
		});
	}

	private getPortLabel(port: DetectedPort): string | null {
		const labels = getLabelsForWorkspace((workspaceId) => {
			try {
				return this.filesystem.resolveWorkspaceRoot(workspaceId);
			} catch {
				return null;
			}
		}, port.workspaceId);
		return labels?.get(port.port) ?? null;
	}

	private startFsWatch(
		socket: WsSocket,
		state: ClientState,
		workspaceId: string,
	): void {
		// Already watching this workspace for this client
		if (state.fsSubscriptions.has(workspaceId)) return;

		let rootPath: string;
		try {
			rootPath = this.filesystem.resolveWorkspaceRoot(workspaceId);
		} catch {
			sendMessage(socket, {
				type: "error",
				message: `Workspace not found: ${workspaceId}`,
			});
			return;
		}

		let disposed = false;
		let iterator: AsyncIterator<{ events: FsWatchEvent[] }> | null = null;

		try {
			const service = this.filesystem.getServiceForWorkspace(workspaceId);
			const stream = service.watchPath({
				absolutePath: rootPath,
			});
			iterator = stream[Symbol.asyncIterator]();
		} catch (error) {
			sendMessage(socket, {
				type: "error",
				message:
					error instanceof Error
						? error.message
						: "Failed to start filesystem watcher",
			});
			return;
		}

		const dispose = () => {
			disposed = true;
			void iterator?.return?.().catch((error: unknown) => {
				console.error("[event-bus] fs watcher cleanup failed:", {
					workspaceId,
					error,
				});
			});
			iterator = null;
		};

		state.fsSubscriptions.set(workspaceId, { workspaceId, dispose });

		// Start streaming events to this client
		void (async () => {
			try {
				while (!disposed && iterator) {
					const next = await iterator.next();
					if (disposed || next.done) return;

					if (process.env.SUPERSET_FS_EVENTS_DEBUG === "1") {
						console.log("[fs:debug] event-bus send", {
							workspaceId,
							count: next.value.events.length,
							kinds: next.value.events.map((e) => e.kind),
						});
					}
					sendMessage(socket, {
						type: "fs:events",
						workspaceId,
						events: next.value.events,
					});
				}
			} catch (error) {
				if (disposed) return;
				console.error("[event-bus] fs stream failed:", {
					workspaceId,
					error,
				});
				sendMessage(socket, {
					type: "error",
					message:
						error instanceof Error
							? error.message
							: "Filesystem event stream failed",
				});
			}
		})();
	}

	private stopFsWatch(state: ClientState, workspaceId: string): void {
		const sub = state.fsSubscriptions.get(workspaceId);
		if (sub) {
			sub.dispose();
			state.fsSubscriptions.delete(workspaceId);
		}
	}

	/**
	 * Register this client's interest in a workspace's `git:changed` events.
	 * Idempotent per client — a second `git:watch` for the same workspace from
	 * the same socket is a no-op (the workspace-client already refcounts
	 * before ever sending the command, so in practice this only guards
	 * against a duplicate/replayed message).
	 */
	private startGitWatch(
		socket: WsSocket,
		state: ClientState,
		workspaceId: string,
	): void {
		if (state.gitSubscriptions.has(workspaceId)) return;
		if (state.gitSubscriptions.size >= MAX_GIT_WATCHES_PER_CLIENT) {
			// Addressed to the workspace so the client can drop its local
			// interest entry and retry later instead of assuming the watch is live.
			sendMessage(socket, {
				type: "error",
				code: "git-watch-cap",
				workspaceId,
				message: "Too many git watches for this client",
			});
			return;
		}
		state.gitSubscriptions.add(workspaceId);
		this.gitWatcher.watchWorkspace(workspaceId);
	}

	private stopGitWatch(state: ClientState, workspaceId: string): void {
		if (!state.gitSubscriptions.delete(workspaceId)) return;
		this.gitWatcher.unwatchWorkspace(workspaceId);
	}

	/**
	 * Targeted watch for one open document. Installs a real per-file watcher
	 * only when the recursive workspace watch delivers nothing for the path
	 * (pruned subtree — gitignored build dir, node_modules, nested repo); a
	 * covered path records a no-op so unwatch stays symmetric. Port of VS
	 * Code's per-resource fallback for visible editors.
	 */
	private startFsFileWatch(
		socket: WsSocket,
		state: ClientState,
		workspaceId: string,
		absolutePath: string,
	): void {
		const key = `${workspaceId}\0${absolutePath}`;
		if (state.fileWatches.has(key)) return;
		if (state.fileWatches.size >= MAX_FILE_WATCHES_PER_CLIENT) {
			sendMessage(socket, {
				type: "error",
				message: "Too many file watches for this client",
			});
			return;
		}

		let rootPath: string;
		try {
			rootPath = this.filesystem.resolveWorkspaceRoot(workspaceId);
		} catch {
			sendMessage(socket, {
				type: "error",
				message: `Workspace not found: ${workspaceId}`,
			});
			return;
		}

		// Only workspace files: a path outside the worktree must not be
		// watchable through a workspace-scoped command.
		const resolved = path.resolve(absolutePath);
		if (
			resolved !== absolutePath ||
			!resolved.startsWith(`${rootPath.replace(/\/$/, "")}/`)
		) {
			sendMessage(socket, {
				type: "error",
				message: "watch-file path must be inside the workspace",
			});
			return;
		}

		if (!this.filesystem.isPathPrunedFromWatch(workspaceId, absolutePath)) {
			// The recursive watcher already covers this file — nothing to add.
			state.fileWatches.set(key, () => {});
			return;
		}

		const dispose = watchSingleFile(absolutePath, (event: FsWatchEvent) => {
			// A dead socket must not throw into the watcher's settle loop; the
			// close handler disposes every file watch for this client.
			try {
				sendMessage(socket, {
					type: "fs:events",
					workspaceId,
					events: [event],
				});
			} catch (error) {
				console.error("[event-bus] file-watch send failed", { error });
			}
		});
		state.fileWatches.set(key, dispose);
	}

	private stopFsFileWatch(
		state: ClientState,
		workspaceId: string,
		absolutePath: string,
	): void {
		const key = `${workspaceId}\0${absolutePath}`;
		const dispose = state.fileWatches.get(key);
		if (dispose) {
			dispose();
			state.fileWatches.delete(key);
		}
	}

	private cleanupClient(_socket: WsSocket, state: ClientState): void {
		for (const sub of state.fsSubscriptions.values()) {
			sub.dispose();
		}
		state.fsSubscriptions.clear();
		for (const dispose of state.fileWatches.values()) {
			dispose();
		}
		state.fileWatches.clear();
		for (const workspaceId of state.gitSubscriptions) {
			this.gitWatcher.unwatchWorkspace(workspaceId);
		}
		state.gitSubscriptions.clear();
	}
}

// ── Route Registration ─────────────────────────────────────────────

export interface RegisterEventBusRouteOptions {
	app: Hono;
	eventBus: EventBus;
	upgradeWebSocket: NodeWebSocket["upgradeWebSocket"];
}

export function registerEventBusRoute({
	app,
	eventBus,
	upgradeWebSocket,
}: RegisterEventBusRouteOptions) {
	app.get(
		"/events",
		upgradeWebSocket(() => {
			return {
				onOpen: (_event, ws) => {
					eventBus.handleOpen(ws);
				},
				onMessage: (event, ws) => {
					eventBus.handleMessage(ws, event.data);
				},
				onClose: (_event, ws) => {
					eventBus.handleClose(ws);
				},
				onError: (_event, ws) => {
					eventBus.handleClose(ws);
				},
			};
		}),
	);
}
