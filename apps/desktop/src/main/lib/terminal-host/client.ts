/**
 * Terminal Host Daemon Client
 *
 * Client library for the Electron main process to communicate with
 * the terminal host daemon. Handles:
 * - Daemon lifecycle (spawning if not running)
 * - Socket connection and reconnection
 * - Request/response framing
 * - Event streaming
 */

import { spawn } from "node:child_process";
import { EventEmitter } from "node:events";
import {
	existsSync,
	mkdirSync,
	readFileSync,
	unlinkSync,
	writeFileSync,
} from "node:fs";
import { connect, type Socket } from "node:net";
import { homedir } from "node:os";
import { join } from "node:path";
import { app } from "electron";
import {
	type ClearScrollbackRequest,
	type CreateOrAttachRequest,
	type CreateOrAttachResponse,
	type DetachRequest,
	type EmptyResponse,
	type HelloResponse,
	type IpcErrorResponse,
	type IpcEvent,
	type IpcResponse,
	type IpcSuccessResponse,
	type KillAllRequest,
	type KillRequest,
	type ListSessionsResponse,
	PROTOCOL_VERSION,
	type ResizeRequest,
	type ShutdownRequest,
	type TerminalDataEvent,
	type TerminalExitEvent,
	type WriteRequest,
} from "./types";

// =============================================================================
// Configuration
// =============================================================================

const SUPERSET_DIR_NAME =
	process.env.NODE_ENV === "development" ? ".superset-dev" : ".superset";
const SUPERSET_HOME_DIR = join(homedir(), SUPERSET_DIR_NAME);

const SOCKET_PATH = join(SUPERSET_HOME_DIR, "terminal-host.sock");
const TOKEN_PATH = join(SUPERSET_HOME_DIR, "terminal-host.token");
const PID_PATH = join(SUPERSET_HOME_DIR, "terminal-host.pid");
const SPAWN_LOCK_PATH = join(SUPERSET_HOME_DIR, "terminal-host.spawn.lock");

// Connection timeouts
const CONNECT_TIMEOUT_MS = 5000;
const SPAWN_WAIT_MS = 2000;
const REQUEST_TIMEOUT_MS = 30000;
const SPAWN_LOCK_TIMEOUT_MS = 10000; // Max time to hold spawn lock

// =============================================================================
// NDJSON Parser
// =============================================================================

class NdjsonParser {
	private buffer = "";

	parse(chunk: string): Array<IpcResponse | IpcEvent> {
		this.buffer += chunk;
		const messages: Array<IpcResponse | IpcEvent> = [];

		let newlineIndex = this.buffer.indexOf("\n");
		while (newlineIndex !== -1) {
			const line = this.buffer.slice(0, newlineIndex);
			this.buffer = this.buffer.slice(newlineIndex + 1);

			if (line.trim()) {
				try {
					messages.push(JSON.parse(line));
				} catch {
					console.warn("[TerminalHostClient] Failed to parse NDJSON line");
				}
			}

			newlineIndex = this.buffer.indexOf("\n");
		}

		return messages;
	}
}

// =============================================================================
// Pending Request Tracker
// =============================================================================

interface PendingRequest {
	resolve: (value: unknown) => void;
	reject: (error: Error) => void;
	timeoutId: NodeJS.Timeout;
}

// =============================================================================
// TerminalHostClient
// =============================================================================

export interface TerminalHostClientEvents {
	data: (sessionId: string, data: string) => void;
	exit: (sessionId: string, exitCode: number, signal?: number) => void;
	connected: () => void;
	disconnected: () => void;
	error: (error: Error) => void;
}

/**
 * Client for communicating with the terminal host daemon.
 * Emits events for terminal data and exit.
 */
export class TerminalHostClient extends EventEmitter {
	private socket: Socket | null = null;
	private parser = new NdjsonParser();
	private pendingRequests = new Map<string, PendingRequest>();
	private requestCounter = 0;
	private authenticated = false;
	private connecting = false;
	private disposed = false;

	// ===========================================================================
	// Connection Management
	// ===========================================================================

	/**
	 * Ensure we have a connected, authenticated socket.
	 * Spawns daemon if needed.
	 */
	async ensureConnected(): Promise<void> {
		if (this.socket && this.authenticated) {
			console.log("[TerminalHostClient] Already connected and authenticated");
			return;
		}

		if (this.connecting) {
			console.log(
				"[TerminalHostClient] Connection already in progress, waiting...",
			);
			// Wait for existing connection attempt
			return new Promise((resolve, reject) => {
				const checkConnection = () => {
					if (this.socket && this.authenticated) {
						resolve();
					} else if (!this.connecting) {
						reject(new Error("Connection failed"));
					} else {
						setTimeout(checkConnection, 100);
					}
				};
				checkConnection();
			});
		}

		this.connecting = true;
		console.log("[TerminalHostClient] Connecting to daemon...");

		try {
			// Try to connect to existing daemon
			let connected = await this.tryConnect();
			console.log(
				`[TerminalHostClient] Initial connection attempt: ${connected ? "SUCCESS" : "FAILED"}`,
			);

			if (!connected) {
				// Spawn daemon and retry
				console.log("[TerminalHostClient] Spawning daemon...");
				await this.spawnDaemon();
				connected = await this.tryConnect();
				console.log(
					`[TerminalHostClient] Post-spawn connection attempt: ${connected ? "SUCCESS" : "FAILED"}`,
				);

				if (!connected) {
					throw new Error("Failed to connect to daemon after spawn");
				}
			}

			// Authenticate
			console.log("[TerminalHostClient] Authenticating...");
			await this.authenticate();
			console.log("[TerminalHostClient] Authentication successful!");
		} finally {
			this.connecting = false;
		}
	}

	/**
	 * Try to connect to the daemon socket.
	 * Returns true if connected, false if daemon not running.
	 */
	private async tryConnect(): Promise<boolean> {
		return new Promise((resolve) => {
			if (!existsSync(SOCKET_PATH)) {
				resolve(false);
				return;
			}

			const socket = connect(SOCKET_PATH);
			let resolved = false;

			const timeout = setTimeout(() => {
				if (!resolved) {
					resolved = true;
					socket.destroy();
					resolve(false);
				}
			}, CONNECT_TIMEOUT_MS);

			socket.on("connect", () => {
				if (!resolved) {
					resolved = true;
					clearTimeout(timeout);
					this.socket = socket;
					this.setupSocketHandlers();
					resolve(true);
				}
			});

			socket.on("error", () => {
				if (!resolved) {
					resolved = true;
					clearTimeout(timeout);
					resolve(false);
				}
			});
		});
	}

	/**
	 * Set up socket event handlers
	 */
	private setupSocketHandlers(): void {
		if (!this.socket) return;

		this.socket.setEncoding("utf-8");

		this.socket.on("data", (data: string) => {
			const messages = this.parser.parse(data);
			for (const message of messages) {
				this.handleMessage(message);
			}
		});

		this.socket.on("close", () => {
			this.handleDisconnect();
		});

		this.socket.on("error", (error) => {
			this.emit("error", error);
			this.handleDisconnect();
		});
	}

	/**
	 * Handle incoming message (response or event)
	 */
	private handleMessage(message: IpcResponse | IpcEvent): void {
		if ("id" in message) {
			// Response to a request
			const pending = this.pendingRequests.get(message.id);
			if (pending) {
				this.pendingRequests.delete(message.id);
				clearTimeout(pending.timeoutId);

				if (message.ok) {
					pending.resolve((message as IpcSuccessResponse).payload);
				} else {
					const error = (message as IpcErrorResponse).error;
					pending.reject(new Error(`${error.code}: ${error.message}`));
				}
			}
		} else if (message.type === "event") {
			// Event from daemon
			const event = message as IpcEvent;
			const payload = event.payload as TerminalDataEvent | TerminalExitEvent;

			if (payload.type === "data") {
				this.emit("data", event.sessionId, (payload as TerminalDataEvent).data);
			} else if (payload.type === "exit") {
				const exitPayload = payload as TerminalExitEvent;
				this.emit(
					"exit",
					event.sessionId,
					exitPayload.exitCode,
					exitPayload.signal,
				);
			}
		}
	}

	/**
	 * Handle socket disconnect
	 */
	private handleDisconnect(): void {
		this.socket = null;
		this.authenticated = false;

		// Reject all pending requests
		for (const [id, pending] of this.pendingRequests.entries()) {
			clearTimeout(pending.timeoutId);
			pending.reject(new Error("Connection lost"));
			this.pendingRequests.delete(id);
		}

		this.emit("disconnected");
	}

	/**
	 * Authenticate with the daemon
	 */
	private async authenticate(): Promise<void> {
		if (!existsSync(TOKEN_PATH)) {
			throw new Error("Auth token not found - daemon may not be running");
		}

		const token = readFileSync(TOKEN_PATH, "utf-8").trim();

		const response = (await this.sendRequest("hello", {
			token,
			protocolVersion: PROTOCOL_VERSION,
		})) as HelloResponse;

		if (response.protocolVersion !== PROTOCOL_VERSION) {
			throw new Error(
				`Protocol version mismatch: client=${PROTOCOL_VERSION}, daemon=${response.protocolVersion}`,
			);
		}

		this.authenticated = true;
		this.emit("connected");
	}

	// ===========================================================================
	// Daemon Spawning
	// ===========================================================================

	/**
	 * Check if there's an active daemon listening on the socket.
	 * Returns true if socket is live and responding.
	 */
	private isSocketLive(): Promise<boolean> {
		return new Promise((resolve) => {
			if (!existsSync(SOCKET_PATH)) {
				resolve(false);
				return;
			}

			const testSocket = connect(SOCKET_PATH);
			const timeout = setTimeout(() => {
				testSocket.destroy();
				resolve(false);
			}, 1000);

			testSocket.on("connect", () => {
				clearTimeout(timeout);
				testSocket.destroy();
				resolve(true);
			});

			testSocket.on("error", () => {
				clearTimeout(timeout);
				resolve(false);
			});
		});
	}

	/**
	 * Acquire spawn lock to prevent concurrent daemon spawns.
	 * Returns true if lock acquired, false if another spawn is in progress.
	 */
	private acquireSpawnLock(): boolean {
		try {
			// Ensure superset home directory exists before any file operations
			if (!existsSync(SUPERSET_HOME_DIR)) {
				mkdirSync(SUPERSET_HOME_DIR, { recursive: true, mode: 0o700 });
			}

			// Check if lock exists and is recent (within timeout)
			if (existsSync(SPAWN_LOCK_PATH)) {
				const lockContent = readFileSync(SPAWN_LOCK_PATH, "utf-8").trim();
				const lockTime = Number.parseInt(lockContent, 10);
				if (
					!Number.isNaN(lockTime) &&
					Date.now() - lockTime < SPAWN_LOCK_TIMEOUT_MS
				) {
					// Lock is held by another process
					return false;
				}
				// Stale lock, remove it
				unlinkSync(SPAWN_LOCK_PATH);
			}

			// Create lock file with current timestamp
			writeFileSync(SPAWN_LOCK_PATH, String(Date.now()), { mode: 0o600 });
			return true;
		} catch {
			return false;
		}
	}

	/**
	 * Release spawn lock
	 */
	private releaseSpawnLock(): void {
		try {
			if (existsSync(SPAWN_LOCK_PATH)) {
				unlinkSync(SPAWN_LOCK_PATH);
			}
		} catch {
			// Best effort cleanup
		}
	}

	/**
	 * Spawn the daemon process if not running
	 */
	private async spawnDaemon(): Promise<void> {
		// Check if socket is live first - this is the authoritative check
		// PID file can be stale if daemon crashed and PID was reused by another process
		if (existsSync(SOCKET_PATH)) {
			const isLive = await this.isSocketLive();
			if (isLive) {
				console.log("[TerminalHostClient] Socket is live, daemon is running");
				return;
			}

			// Socket exists but not responsive - safe to remove
			console.log("[TerminalHostClient] Removing stale socket file");
			try {
				unlinkSync(SOCKET_PATH);
			} catch {
				// Ignore - might not have permission
			}
		}

		// Also clean up stale PID file if socket was not live
		// This handles the case where daemon crashed and PID was reused
		if (existsSync(PID_PATH)) {
			console.log("[TerminalHostClient] Removing stale PID file");
			try {
				unlinkSync(PID_PATH);
			} catch {
				// Ignore - might not have permission
			}
		}

		// Acquire spawn lock to prevent concurrent spawns
		if (!this.acquireSpawnLock()) {
			console.log("[TerminalHostClient] Another spawn in progress, waiting...");
			// Wait for the other spawn to complete
			await this.waitForDaemon();
			return;
		}

		try {
			// Get path to daemon script
			const daemonScript = this.getDaemonScriptPath();
			console.log(`[TerminalHostClient] Daemon script path: ${daemonScript}`);
			console.log(
				`[TerminalHostClient] Script exists: ${existsSync(daemonScript)}`,
			);

			if (!existsSync(daemonScript)) {
				throw new Error(`Daemon script not found: ${daemonScript}`);
			}

			console.log(
				`[TerminalHostClient] Spawning daemon with execPath: ${process.execPath}`,
			);

			// Spawn daemon as detached process
			const child = spawn(process.execPath, [daemonScript], {
				detached: true,
				stdio: "ignore",
				env: {
					...process.env,
					ELECTRON_RUN_AS_NODE: "1",
					NODE_ENV: process.env.NODE_ENV,
				},
			});

			console.log(`[TerminalHostClient] Daemon spawned with PID: ${child.pid}`);

			// Unref to allow parent to exit independently
			child.unref();

			// Wait for daemon to start
			console.log("[TerminalHostClient] Waiting for daemon to start...");
			await this.waitForDaemon();
			console.log("[TerminalHostClient] Daemon started successfully");
		} finally {
			this.releaseSpawnLock();
		}
	}

	/**
	 * Get path to daemon script
	 */
	private getDaemonScriptPath(): string {
		if (app.isPackaged) {
			// Production: script is in app resources
			return join(app.getAppPath(), "dist", "main", "terminal-host.js");
		}

		// Development: electron-vite outputs to dist/main/
		const appPath = app.getAppPath();
		return join(appPath, "dist", "main", "terminal-host.js");
	}

	/**
	 * Wait for daemon to be ready
	 */
	private async waitForDaemon(): Promise<void> {
		const startTime = Date.now();

		while (Date.now() - startTime < SPAWN_WAIT_MS) {
			if (existsSync(SOCKET_PATH)) {
				// Give it a moment to start listening
				await this.sleep(200);
				return;
			}
			await this.sleep(100);
		}

		throw new Error("Daemon failed to start in time");
	}

	private sleep(ms: number): Promise<void> {
		return new Promise((resolve) => setTimeout(resolve, ms));
	}

	// ===========================================================================
	// Request/Response
	// ===========================================================================

	/**
	 * Send a request to the daemon and wait for response
	 */
	private sendRequest(type: string, payload: unknown): Promise<unknown> {
		return new Promise((resolve, reject) => {
			if (!this.socket) {
				reject(new Error("Not connected"));
				return;
			}

			const id = `req_${++this.requestCounter}`;

			const timeoutId = setTimeout(() => {
				this.pendingRequests.delete(id);
				reject(new Error(`Request timeout: ${type}`));
			}, REQUEST_TIMEOUT_MS);

			this.pendingRequests.set(id, { resolve, reject, timeoutId });

			const message = `${JSON.stringify({ id, type, payload })}\n`;
			this.socket.write(message);
		});
	}

	// ===========================================================================
	// Public API
	// ===========================================================================

	/**
	 * Create or attach to a terminal session
	 */
	async createOrAttach(
		request: CreateOrAttachRequest,
	): Promise<CreateOrAttachResponse> {
		await this.ensureConnected();
		return (await this.sendRequest(
			"createOrAttach",
			request,
		)) as CreateOrAttachResponse;
	}

	/**
	 * Write data to a terminal session
	 */
	async write(request: WriteRequest): Promise<EmptyResponse> {
		await this.ensureConnected();
		return (await this.sendRequest("write", request)) as EmptyResponse;
	}

	/**
	 * Resize a terminal session
	 */
	async resize(request: ResizeRequest): Promise<EmptyResponse> {
		await this.ensureConnected();
		return (await this.sendRequest("resize", request)) as EmptyResponse;
	}

	/**
	 * Detach from a terminal session
	 */
	async detach(request: DetachRequest): Promise<EmptyResponse> {
		await this.ensureConnected();
		return (await this.sendRequest("detach", request)) as EmptyResponse;
	}

	/**
	 * Kill a terminal session
	 */
	async kill(request: KillRequest): Promise<EmptyResponse> {
		await this.ensureConnected();
		return (await this.sendRequest("kill", request)) as EmptyResponse;
	}

	/**
	 * Kill all terminal sessions
	 */
	async killAll(request: KillAllRequest): Promise<EmptyResponse> {
		await this.ensureConnected();
		return (await this.sendRequest("killAll", request)) as EmptyResponse;
	}

	/**
	 * List all sessions
	 */
	async listSessions(): Promise<ListSessionsResponse> {
		await this.ensureConnected();
		return (await this.sendRequest(
			"listSessions",
			undefined,
		)) as ListSessionsResponse;
	}

	/**
	 * Clear scrollback for a session
	 */
	async clearScrollback(
		request: ClearScrollbackRequest,
	): Promise<EmptyResponse> {
		await this.ensureConnected();
		return (await this.sendRequest(
			"clearScrollback",
			request,
		)) as EmptyResponse;
	}

	/**
	 * Shutdown the daemon gracefully.
	 * After calling this, the client should be disposed and a new daemon
	 * will be spawned on the next getTerminalHostClient() call.
	 */
	async shutdown(request: ShutdownRequest = {}): Promise<EmptyResponse> {
		await this.ensureConnected();
		const response = (await this.sendRequest(
			"shutdown",
			request,
		)) as EmptyResponse;
		// Disconnect after shutdown request is sent
		this.disconnect();
		return response;
	}

	/**
	 * Disconnect from daemon (but don't stop it)
	 */
	disconnect(): void {
		if (this.socket) {
			this.socket.destroy();
			this.socket = null;
		}
		this.authenticated = false;
	}

	/**
	 * Dispose of the client
	 */
	dispose(): void {
		if (this.disposed) return;
		this.disposed = true;
		this.disconnect();
		this.removeAllListeners();
	}
}

// =============================================================================
// Singleton Instance
// =============================================================================

let clientInstance: TerminalHostClient | null = null;

/**
 * Get the singleton terminal host client instance
 */
export function getTerminalHostClient(): TerminalHostClient {
	if (!clientInstance) {
		clientInstance = new TerminalHostClient();
	}
	return clientInstance;
}

/**
 * Dispose of the singleton client
 */
export function disposeTerminalHostClient(): void {
	if (clientInstance) {
		clientInstance.dispose();
		clientInstance = null;
	}
}
