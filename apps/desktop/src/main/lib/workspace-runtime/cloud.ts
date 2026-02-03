/**
 * Cloud Workspace Runtime
 *
 * This is the cloud implementation of WorkspaceRuntime that connects
 * to the Superset control plane via WebSocket for remote execution.
 *
 * Cloud workspaces run Claude Code in Modal sandboxes and stream
 * events back through the control plane.
 */

import { EventEmitter } from "node:events";
import type { CreateSessionParams, SessionResult } from "../terminal/types";
import type {
	TerminalCapabilities,
	TerminalManagement,
	TerminalRuntime,
	WorkspaceRuntime,
	WorkspaceRuntimeId,
} from "./types";

// =============================================================================
// Cloud Event Types
// =============================================================================

export interface CloudSessionConfig {
	sessionId: string;
	controlPlaneUrl: string;
	authToken: string;
}

export interface CloudEvent {
	id: string;
	type:
		| "tool_call"
		| "tool_result"
		| "token"
		| "error"
		| "git_sync"
		| "execution_complete"
		| "heartbeat";
	timestamp: number;
	data: unknown;
	messageId?: string;
}

export interface CloudSessionState {
	sessionId: string;
	status: string;
	sandboxStatus: string;
	repoOwner: string;
	repoName: string;
	branch: string;
	baseBranch: string;
	model: string;
	participants: Array<{
		id: string;
		userId: string;
		userName: string;
		avatarUrl?: string;
		source: string;
		isOnline: boolean;
	}>;
	messageCount: number;
	eventCount: number;
}

// =============================================================================
// Cloud WebSocket Connection
// =============================================================================

class CloudWebSocketConnection extends EventEmitter {
	private ws: WebSocket | null = null;
	private reconnectAttempts = 0;
	private maxReconnectAttempts = 5;
	private reconnectDelay = 1000;
	private pingInterval: NodeJS.Timeout | null = null;

	constructor(private config: CloudSessionConfig) {
		super();
	}

	async connect(): Promise<void> {
		const wsUrl = this.config.controlPlaneUrl
			.replace("https://", "wss://")
			.replace("http://", "ws://");

		const url = `${wsUrl}/api/sessions/${this.config.sessionId}/ws`;

		return new Promise((resolve, reject) => {
			try {
				this.ws = new WebSocket(url);

				this.ws.onopen = () => {
					this.reconnectAttempts = 0;
					// Send subscribe message with auth token
					this.send({ type: "subscribe", token: this.config.authToken });
					this.startPingInterval();
					resolve();
				};

				this.ws.onmessage = (event) => {
					try {
						const message = JSON.parse(event.data as string);
						this.handleMessage(message);
					} catch (e) {
						console.error("[cloud-ws] Failed to parse message:", e);
					}
				};

				this.ws.onclose = () => {
					this.stopPingInterval();
					this.emit("disconnect");
					this.attemptReconnect();
				};

				this.ws.onerror = (error) => {
					console.error("[cloud-ws] WebSocket error:", error);
					this.emit("error", error);
					reject(error);
				};
			} catch (error) {
				reject(error);
			}
		});
	}

	private handleMessage(message: {
		type: string;
		sessionId?: string;
		state?: CloudSessionState;
		event?: CloudEvent;
		message?: string;
	}): void {
		switch (message.type) {
			case "subscribed":
				this.emit("subscribed", {
					sessionId: message.sessionId,
					state: message.state,
				});
				break;

			case "event":
				this.emit("event", message.event);
				break;

			case "state_update":
				this.emit("state_update", message.state);
				break;

			case "error":
				this.emit("server_error", message.message);
				break;

			case "pong":
				// Heartbeat response received
				break;
		}
	}

	send(message: { type: string; [key: string]: unknown }): void {
		if (this.ws?.readyState === WebSocket.OPEN) {
			this.ws.send(JSON.stringify(message));
		}
	}

	sendPrompt(content: string, authorId: string): void {
		this.send({ type: "prompt", content, authorId });
	}

	sendStop(): void {
		this.send({ type: "stop" });
	}

	private startPingInterval(): void {
		this.pingInterval = setInterval(() => {
			this.send({ type: "ping" });
		}, 30000);
	}

	private stopPingInterval(): void {
		if (this.pingInterval) {
			clearInterval(this.pingInterval);
			this.pingInterval = null;
		}
	}

	private attemptReconnect(): void {
		if (this.reconnectAttempts >= this.maxReconnectAttempts) {
			this.emit("reconnect_failed");
			return;
		}

		this.reconnectAttempts++;
		const delay = this.reconnectDelay * 2 ** (this.reconnectAttempts - 1);

		setTimeout(() => {
			this.connect().catch((error) => {
				console.error("[cloud-ws] Reconnect failed:", error);
			});
		}, delay);
	}

	disconnect(): void {
		this.stopPingInterval();
		if (this.ws) {
			this.ws.close();
			this.ws = null;
		}
	}
}

// =============================================================================
// Cloud Terminal Runtime (Stub Implementation)
// =============================================================================

/**
 * Cloud terminal runtime - provides terminal-like interface for cloud sessions.
 *
 * Note: Cloud workspaces don't have local terminals in the traditional sense.
 * This implements the TerminalRuntime interface but delegates to the
 * control plane for actual execution.
 */
class CloudTerminalRuntime extends EventEmitter implements TerminalRuntime {
	readonly management: TerminalManagement | null = null;
	readonly capabilities: TerminalCapabilities = {
		persistent: false, // Cloud sessions are ephemeral from the desktop's perspective
		coldRestore: false,
	};

	private connection: CloudWebSocketConnection | null = null;
	private sessionState: CloudSessionState | null = null;

	constructor(private config: CloudSessionConfig) {
		super();
	}

	async initialize(): Promise<void> {
		this.connection = new CloudWebSocketConnection(this.config);

		// Forward connection events
		this.connection.on(
			"subscribed",
			(data: { sessionId: string; state: CloudSessionState }) => {
				this.sessionState = data.state;
				this.emit("subscribed", data);
			},
		);

		this.connection.on("event", (event: CloudEvent) => {
			// Emit events in a format similar to terminal data
			// so existing UI can consume them
			this.emit(`event:${this.config.sessionId}`, event);

			// Also emit as data for terminal-like rendering
			if (event.type === "token") {
				const token = (event.data as { token: string }).token;
				this.emit(`data:${this.config.sessionId}`, token);
			}
		});

		this.connection.on("state_update", (state: Partial<CloudSessionState>) => {
			if (this.sessionState) {
				Object.assign(this.sessionState, state);
			}
			this.emit("state_update", state);
		});

		this.connection.on("disconnect", () => {
			this.emit(`disconnect:${this.config.sessionId}`);
		});

		this.connection.on("error", (error: Error) => {
			this.emit(`error:${this.config.sessionId}`, error);
		});

		await this.connection.connect();
	}

	// ===========================================================================
	// Session Operations (adapted for cloud)
	// ===========================================================================

	async createOrAttach(_params: CreateSessionParams): Promise<SessionResult> {
		// For cloud workspaces, "creating" a session means connecting to an existing
		// cloud session. The session is created on the control plane side.
		return {
			isNew: false, // Cloud sessions are always "existing" from desktop's perspective
			scrollback: "", // No local scrollback for cloud sessions
			wasRecovered: false, // Cloud sessions don't use local recovery
			isColdRestore: false,
		};
	}

	write(params: { paneId: string; data: string }): void {
		// In cloud mode, "writing" means sending a prompt
		// The control plane will execute it
		if (this.connection && params.paneId === this.config.sessionId) {
			this.connection.sendPrompt(params.data, "desktop-user");
		}
	}

	resize(_params: { paneId: string; cols: number; rows: number }): void {
		// Cloud terminals don't need resize - they're not PTY-based
	}

	signal(params: { paneId: string; signal?: string }): void {
		// Signal handling - stop the current execution
		if (params.signal === "SIGINT" || params.signal === "SIGTERM") {
			this.connection?.sendStop();
		}
	}

	async kill(_params: { paneId: string }): Promise<void> {
		// Kill the cloud session connection
		this.connection?.disconnect();
	}

	detach(_params: { paneId: string }): void {
		// Detach just closes the WebSocket but keeps the cloud session alive
		this.connection?.disconnect();
	}

	clearScrollback(_params: { paneId: string }): void {
		// No scrollback in cloud mode - events are streamed
	}

	ackColdRestore(_paneId: string): void {
		// No cold restore in cloud mode
	}

	getSession(
		paneId: string,
	): { isAlive: boolean; cwd: string; lastActive: number } | null {
		if (paneId !== this.config.sessionId) {
			return null;
		}

		return {
			isAlive: this.sessionState !== null,
			cwd: `${this.sessionState?.repoOwner}/${this.sessionState?.repoName}`,
			lastActive: Date.now(),
		};
	}

	getSessionState(): CloudSessionState | null {
		return this.sessionState;
	}

	// ===========================================================================
	// Workspace Operations
	// ===========================================================================

	async killByWorkspaceId(
		_workspaceId: string,
	): Promise<{ killed: number; failed: number }> {
		// Cloud workspaces have only one session per workspace
		this.connection?.disconnect();
		return { killed: 1, failed: 0 };
	}

	async getSessionCountByWorkspaceId(_workspaceId: string): Promise<number> {
		return this.connection ? 1 : 0;
	}

	refreshPromptsForWorkspace(_workspaceId: string): void {
		// No prompt refresh needed in cloud mode
	}

	// ===========================================================================
	// Event Source
	// ===========================================================================

	detachAllListeners(): void {
		this.removeAllListeners();
	}

	// ===========================================================================
	// Cleanup
	// ===========================================================================

	async cleanup(): Promise<void> {
		this.connection?.disconnect();
		this.connection = null;
	}
}

// =============================================================================
// Cloud Workspace Runtime
// =============================================================================

/**
 * Cloud workspace runtime implementation.
 *
 * This provides the WorkspaceRuntime interface for cloud workspaces,
 * connecting to the control plane for remote execution.
 */
export class CloudWorkspaceRuntime implements WorkspaceRuntime {
	readonly id: WorkspaceRuntimeId;
	readonly terminal: TerminalRuntime;
	readonly capabilities: WorkspaceRuntime["capabilities"];

	private terminalRuntime: CloudTerminalRuntime;

	constructor(config: CloudSessionConfig) {
		this.id = `cloud:${config.sessionId}`;

		// Create cloud terminal runtime
		this.terminalRuntime = new CloudTerminalRuntime(config);
		this.terminal = this.terminalRuntime;

		// Aggregate capabilities
		this.capabilities = {
			terminal: this.terminal.capabilities,
		};
	}

	/**
	 * Initialize the cloud connection.
	 * Must be called before using the runtime.
	 */
	async initialize(): Promise<void> {
		await this.terminalRuntime.initialize();
	}

	/**
	 * Get the current session state.
	 */
	getState(): CloudSessionState | null {
		return (this.terminalRuntime as CloudTerminalRuntime).getSessionState();
	}
}
