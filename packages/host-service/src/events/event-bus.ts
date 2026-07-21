import { randomUUID } from "node:crypto";
import type { NodeWebSocket } from "@hono/node-ws";
import type { DetectedPort } from "@superset/port-scanner";
import type { FsWatchEvent } from "@superset/workspace-fs/host";
import type { Hono } from "hono";
import type { HostDb } from "../db/index.ts";
import { portManager } from "../ports/port-manager.ts";
import { getLabelsForWorkspace } from "../ports/static-ports.ts";
import type { WorkspaceFilesystemManager } from "../runtime/filesystem/index.ts";
import type { GitWatcher } from "./git-watcher.ts";
import type {
	ClientMessage,
	ServerMessage,
	SidebarCommand,
	SidebarCommandResult,
	SidebarStateSnapshot,
} from "./types.ts";

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
		if (!parsed || typeof parsed !== "object") return null;
		if (
			(parsed.type === "fs:watch" || parsed.type === "fs:unwatch") &&
			typeof parsed.workspaceId === "string"
		) {
			return parsed as ClientMessage;
		}
		if (
			parsed.type === "sidebar:result" &&
			typeof parsed.commandId === "string" &&
			((parsed.ok === true &&
				Array.isArray(parsed.state?.groups) &&
				Array.isArray(parsed.state?.workspaces)) ||
				(parsed.ok === false && typeof parsed.error === "string"))
		) {
			return parsed as ClientMessage;
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
	sidebarCommandTimeoutMs?: number;
}

interface PendingSidebarCommand {
	resolve: (state: SidebarStateSnapshot) => void;
	reject: (error: Error) => void;
	timer: ReturnType<typeof setTimeout>;
}

const DEFAULT_SIDEBAR_COMMAND_TIMEOUT_MS = 5_000;

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
	private readonly sidebarCommandTimeoutMs: number;
	private readonly pendingSidebarCommands = new Map<
		string,
		PendingSidebarCommand
	>();
	private removeGitListener: (() => void) | null = null;
	private removePortListeners: (() => void) | null = null;

	constructor(options: EventBusOptions) {
		this.filesystem = options.filesystem;
		this.gitWatcher = options.gitWatcher;
		this.sidebarCommandTimeoutMs =
			options.sidebarCommandTimeoutMs ?? DEFAULT_SIDEBAR_COMMAND_TIMEOUT_MS;
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
		for (const [commandId, pending] of this.pendingSidebarCommands) {
			clearTimeout(pending.timer);
			pending.reject(new Error("Host event bus closed before sidebar replied"));
			this.pendingSidebarCommands.delete(commandId);
		}
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
		} else if (message.type === "sidebar:result") {
			this.resolveSidebarCommand(message);
		}
	}

	requestSidebarCommand(
		targetMachineId: string,
		command: SidebarCommand,
	): Promise<SidebarStateSnapshot> {
		const commandId = randomUUID();
		return new Promise((resolve, reject) => {
			const timer = setTimeout(() => {
				this.pendingSidebarCommands.delete(commandId);
				reject(
					new Error(
						"Superset did not acknowledge the sidebar command. Open the desktop app on this machine and try again.",
					),
				);
			}, this.sidebarCommandTimeoutMs);
			this.pendingSidebarCommands.set(commandId, { resolve, reject, timer });
			this.broadcast({
				type: "sidebar:command",
				commandId,
				targetMachineId,
				command,
			});
		});
	}

	private resolveSidebarCommand(message: SidebarCommandResult): void {
		const pending = this.pendingSidebarCommands.get(message.commandId);
		if (!pending) return;
		clearTimeout(pending.timer);
		this.pendingSidebarCommands.delete(message.commandId);
		if (message.ok) {
			pending.resolve(message.state);
		} else {
			pending.reject(new Error(message.error));
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
		this.broadcast({ type: "workspace:changed", ...message });
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
