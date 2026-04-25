import type { NodeWebSocket } from "@hono/node-ws";
import type { DetectedPort } from "@superset/port-scanner";
import type { FsWatchEvent } from "@superset/workspace-fs/host";
import type { Hono } from "hono";
import type { HostDb } from "../db";
import { portManager } from "../ports/port-manager";
import { getLabelsForWorkspace } from "../ports/static-ports";
import type { WorkspaceFilesystemManager } from "../runtime/filesystem";
import { GitWatcher } from "./git-watcher";
import type { ClientMessage, ServerMessage } from "./types";

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
}

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
			if (parsed.type === "fs:watch" || parsed.type === "fs:unwatch") {
				return parsed as ClientMessage;
			}
		}
	} catch {
		// Malformed message — ignore
	}
	return null;
}

export interface EventBusOptions {
	db: HostDb;
	filesystem: WorkspaceFilesystemManager;
}

/**
 * Unified WebSocket event bus for the host-service.
 *
 * One connection per client. Carries:
 * - `git:changed` events (auto-pushed for all workspaces)
 * - `port:changed` events (auto-pushed for all workspace terminals)
 * - `fs:events` (on-demand per client request)
 */
export class EventBus {
	private readonly clients = new Map<WsSocket, ClientState>();
	private readonly gitWatcher: GitWatcher;
	private readonly filesystem: WorkspaceFilesystemManager;
	private removeGitListener: (() => void) | null = null;
	private removePortListeners: (() => void) | null = null;

	constructor(options: EventBusOptions) {
		this.filesystem = options.filesystem;
		this.gitWatcher = new GitWatcher(options.db, options.filesystem);
	}

	start(): void {
		if (this.removeGitListener || this.removePortListeners) return;

		this.gitWatcher.start();
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
		this.gitWatcher.close();
		for (const [socket, state] of this.clients) {
			this.cleanupClient(socket, state);
		}
		this.clients.clear();
	}

	handleOpen(socket: WsSocket): void {
		this.clients.set(socket, { fsSubscriptions: new Map() });
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
		for (const socket of this.clients.keys()) {
			sendMessage(socket, message);
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
		this.broadcast({ type: "terminal:lifecycle", ...message });
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
				recursive: true,
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

	private cleanupClient(_socket: WsSocket, state: ClientState): void {
		for (const sub of state.fsSubscriptions.values()) {
			sub.dispose();
		}
		state.fsSubscriptions.clear();
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
