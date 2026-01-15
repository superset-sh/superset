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
import { randomUUID } from "node:crypto";
import { EventEmitter } from "node:events";
import {
	chmodSync,
	closeSync,
	existsSync,
	mkdirSync,
	openSync,
	readFileSync,
	statSync,
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
	type IpcEvent,
	type IpcResponse,
	type KillAllRequest,
	type KillRequest,
	type ListSessionsResponse,
	PROTOCOL_VERSION,
	type ResizeRequest,
	type ShutdownRequest,
	type SignalRequest,
	type TerminalDataEvent,
	type TerminalErrorEvent,
	type TerminalExitEvent,
	type WriteRequest,
} from "./types";

// =============================================================================
// Connection State
// =============================================================================

enum ConnectionState {
	DISCONNECTED = "disconnected",
	CONNECTING = "connecting",
	CONNECTED = "connected",
}

// =============================================================================
// Configuration
// =============================================================================

const DEBUG_CLIENT = process.env.SUPERSET_TERMINAL_DEBUG === "1";

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

// Queue limits
const MAX_NOTIFY_QUEUE_BYTES = 2_000_000; // 2MB cap to prevent OOM
const MAX_DAEMON_LOG_BYTES = 5 * 1024 * 1024; // 5MB cap for daemon.log

// =============================================================================
// NDJSON Parser
// =============================================================================

class NdjsonParser {
	private remainder = "";

	parse(chunk: string): Array<IpcResponse | IpcEvent> {
		const messages: Array<IpcResponse | IpcEvent> = [];

		// Prepend any remainder from previous parse
		const data = this.remainder + chunk;
		this.remainder = "";

		let startIndex = 0;
		let newlineIndex = data.indexOf("\n");

		while (newlineIndex !== -1) {
			const line = data.slice(startIndex, newlineIndex);

			if (line.trim()) {
				try {
					messages.push(JSON.parse(line));
				} catch {
					console.warn("[TerminalHostClient] Failed to parse NDJSON line");
				}
			}

			startIndex = newlineIndex + 1;
			newlineIndex = data.indexOf("\n", startIndex);
		}

		// Save any remaining data after the last newline
		if (startIndex < data.length) {
			this.remainder = data.slice(startIndex);
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
	/** Terminal-specific error (e.g., write queue full - paste dropped) */
	terminalError: (sessionId: string, error: string, code?: string) => void;
	connected: () => void;
	disconnected: () => void;
	error: (error: Error) => void;
}

/**
 * Client for communicating with the terminal host daemon.
 * Emits events for terminal data and exit.
 */
export class TerminalHostClient extends EventEmitter {
	private controlSocket: Socket | null = null;
	private streamSocket: Socket | null = null;
	private controlParser = new NdjsonParser();
	private streamParser = new NdjsonParser();
	private pendingRequests = new Map<string, PendingRequest>();
	private requestCounter = 0;
	private controlAuthenticated = false;
	private streamAuthenticated = false;
	private connectionState = ConnectionState.DISCONNECTED;
	private disposed = false;
	private notifyQueue: string[] = [];
	private notifyQueueBytes = 0;
	private notifyDrainArmed = false;
	private disconnectArmed = false;
	private clientId = randomUUID();

	constructor() {
		super();
		if (DEBUG_CLIENT) {
			console.log("[TerminalHostClient] Initialized with paths:", {
				SUPERSET_DIR_NAME,
				SUPERSET_HOME_DIR,
				SOCKET_PATH,
				NODE_ENV: process.env.NODE_ENV,
			});
		}
	}

	// ===========================================================================
	// Connection Management
	// ===========================================================================

	/**
	 * Ensure we have a connected, authenticated socket.
	 * Spawns daemon if needed.
	 */
	async ensureConnected(): Promise<void> {
		// Already connected - fast path (no logging to avoid noise on every API call)
		if (
			this.connectionState === ConnectionState.CONNECTED &&
			this.controlSocket &&
			this.streamSocket &&
			this.controlAuthenticated &&
			this.streamAuthenticated
		) {
			return;
		}

		// Another connection in progress - wait with timeout
		if (this.connectionState === ConnectionState.CONNECTING) {
			if (DEBUG_CLIENT) {
				console.log(
					"[TerminalHostClient] Connection already in progress, waiting...",
				);
			}
			return new Promise((resolve, reject) => {
				const startTime = Date.now();
				const WAIT_TIMEOUT_MS = 10000; // 10 seconds max wait

				const checkConnection = () => {
					if (
						this.connectionState === ConnectionState.CONNECTED &&
						this.controlSocket &&
						this.streamSocket &&
						this.controlAuthenticated &&
						this.streamAuthenticated
					) {
						resolve();
					} else if (this.connectionState === ConnectionState.DISCONNECTED) {
						reject(new Error("Connection failed while waiting"));
					} else if (Date.now() - startTime > WAIT_TIMEOUT_MS) {
						reject(
							new Error(
								"Timeout waiting for connection - daemon may be unresponsive",
							),
						);
					} else {
						setTimeout(checkConnection, 100);
					}
				};
				checkConnection();
			});
		}

		this.connectionState = ConnectionState.CONNECTING;
		this.disconnectArmed = false;
		if (DEBUG_CLIENT) {
			console.log("[TerminalHostClient] Connecting to daemon...");
		}

		try {
			await this.connectAndAuthenticate();
			this.connectionState = ConnectionState.CONNECTED;
			this.disconnectArmed = false;
			this.emit("connected");
		} catch (error) {
			// Reset without emitting disconnected (connection never became usable)
			this.resetConnectionState({ emitDisconnected: false });
			throw error;
		}
	}

	/**
	 * Try to connect and authenticate to an existing daemon without spawning.
	 * Returns true if successfully connected and authenticated, false if no daemon running.
	 * This is useful for cleanup operations that should only act on existing daemons.
	 */
	async tryConnectAndAuthenticate(): Promise<boolean> {
		// Already connected and authenticated (control socket is sufficient here)
		if (this.controlSocket && this.controlAuthenticated) return true;

		// Don't interfere with an in-progress connection
		if (this.connectionState === ConnectionState.CONNECTING) {
			return false;
		}

		this.connectionState = ConnectionState.CONNECTING;

		try {
			const connected = await this.tryConnectControl();
			if (!connected) {
				this.resetConnectionState({ emitDisconnected: false });
				return false;
			}

			const token = this.readAuthToken();
			await this.authenticateControl({ token });
			this.connectionState = ConnectionState.CONNECTED; // control-only
			return true;
		} catch (_error) {
			this.resetConnectionState({ emitDisconnected: false });
			return false;
		}
	}

	/**
	 * Connect and authenticate both control + stream sockets.
	 * Handles protocol mismatch by shutting down a legacy daemon and retrying once.
	 */
	private async connectAndAuthenticate(): Promise<void> {
		for (let attempt = 0; attempt < 2; attempt++) {
			// Control socket (RPC)
			let controlConnected = await this.tryConnectControl();
			if (!controlConnected) {
				await this.spawnDaemon();
				controlConnected = await this.tryConnectControl();
				if (!controlConnected) {
					throw new Error("Failed to connect control socket after spawn");
				}
			}

			// Token is created by the daemon at startup, so we must read it after we’ve
			// ensured a daemon exists (fresh installs / cleaned ~/.superset).
			let token: string;
			try {
				token = this.readAuthToken();
			} catch (error) {
				// If a socket exists but the token is missing, we can’t authenticate; force
				// a daemon restart to re-create a coherent socket+token pair.
				if (attempt === 0) {
					if (DEBUG_CLIENT) {
						console.log(
							"[TerminalHostClient] Auth token missing, restarting daemon...",
						);
					}
					this.resetConnectionState({ emitDisconnected: false });
					this.killDaemonFromPidFile();
					await this.waitForDaemonShutdown();
					await this.spawnDaemon();
					continue;
				}
				throw error;
			}

			try {
				await this.authenticateControl({ token });
			} catch (error) {
				if (attempt === 0 && this.isProtocolMismatchError(error)) {
					if (DEBUG_CLIENT) {
						console.log(
							"[TerminalHostClient] Protocol mismatch detected, shutting down legacy daemon...",
						);
					}
					this.resetConnectionState({ emitDisconnected: false });
					await this.shutdownLegacyDaemon();
					await this.waitForDaemonShutdown();
					await this.spawnDaemon();
					continue;
				}
				throw error;
			}

			// Stream socket (events)
			const streamConnected = await this.tryConnectStream();
			if (!streamConnected) {
				throw new Error("Failed to connect stream socket");
			}

			await this.authenticateStream({ token });
			this.setupStreamSocketHandlers();
			return;
		}

		throw new Error("Failed to connect after protocol upgrade");
	}

	private killDaemonFromPidFile(): void {
		if (!existsSync(PID_PATH)) return;

		try {
			const raw = readFileSync(PID_PATH, "utf-8").trim();
			const pid = Number.parseInt(raw, 10);
			if (!Number.isNaN(pid)) {
				try {
					process.kill(pid, "SIGTERM");
				} catch {
					// Best-effort; PID may be stale or process already exited.
				}
			}
		} catch {
			// Best-effort.
		}
	}

	private async tryConnectControl(): Promise<boolean> {
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
					this.controlSocket = socket;
					this.setupControlSocketHandlers();
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

	private async tryConnectStream(): Promise<boolean> {
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
					socket.setEncoding("utf-8");
					socket.on("close", () => this.handleDisconnect());
					socket.on("error", (error) => {
						this.emit(
							"error",
							error instanceof Error ? error : new Error(String(error)),
						);
						this.handleDisconnect();
					});
					this.streamSocket = socket;
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

	private setupControlSocketHandlers(): void {
		if (!this.controlSocket) return;

		this.controlSocket.setEncoding("utf-8");

		this.controlSocket.on("data", (data: string) => {
			const messages = this.controlParser.parse(data);
			for (const message of messages) {
				this.handleMessage(message);
			}
		});

		this.controlSocket.on("drain", () => {
			this.flushNotifyQueue();
		});

		this.controlSocket.on("close", () => {
			this.handleDisconnect();
		});

		this.controlSocket.on("error", (error) => {
			this.emit("error", error);
			this.handleDisconnect();
		});
	}

	private setupStreamSocketHandlers(): void {
		if (!this.streamSocket) return;

		this.streamSocket.on("data", (data: string) => {
			const messages = this.streamParser.parse(data);
			for (const message of messages) {
				try {
					this.handleMessage(message);
				} catch (error) {
					this.emit("error", error);
				}
			}
		});
	}

	/**
	 * Handle incoming message (response or event)
	 */
	private handleMessage(message: IpcResponse | IpcEvent): void {
		// Type guard: responses have 'id' field, events have 'type: event'
		if ("id" in message) {
			// Response to a request
			const pending = this.pendingRequests.get(message.id);
			if (pending) {
				this.pendingRequests.delete(message.id);
				clearTimeout(pending.timeoutId);

				if (message.ok) {
					pending.resolve(message.payload);
				} else {
					pending.reject(
						new Error(`${message.error.code}: ${message.error.message}`),
					);
				}
			}
		} else if (message.type === "event") {
			// Event from daemon - narrow payload based on type field
			const { sessionId, payload } = message;
			const eventPayload = payload as
				| TerminalDataEvent
				| TerminalExitEvent
				| TerminalErrorEvent;

			switch (eventPayload.type) {
				case "data":
					this.emit("data", sessionId, eventPayload.data);
					break;
				case "exit":
					this.emit(
						"exit",
						sessionId,
						eventPayload.exitCode,
						eventPayload.signal,
					);
					break;
				case "error":
					// Emit terminal-specific error so callers can handle it
					// This is critical for "Write queue full" - paste was silently dropped before!
					this.emit(
						"terminalError",
						sessionId,
						eventPayload.error,
						eventPayload.code,
					);
					break;
			}
		}
	}

	/**
	 * Handle socket disconnect
	 */
	private handleDisconnect(): void {
		if (this.disconnectArmed) return;
		this.disconnectArmed = true;
		this.resetConnectionState({ emitDisconnected: true });
	}

	/**
	 * Reset all connection state and optionally emit `disconnected`.
	 */
	private resetConnectionState({
		emitDisconnected,
	}: {
		emitDisconnected: boolean;
	}): void {
		// Destroy sockets (best-effort; close handlers may also fire)
		try {
			this.controlSocket?.destroy();
		} catch {
			// Ignore
		}
		try {
			this.streamSocket?.destroy();
		} catch {
			// Ignore
		}

		this.controlSocket = null;
		this.streamSocket = null;

		this.controlAuthenticated = false;
		this.streamAuthenticated = false;
		this.connectionState = ConnectionState.DISCONNECTED;

		this.notifyQueue = [];
		this.notifyQueueBytes = 0;
		this.notifyDrainArmed = false;

		this.controlParser = new NdjsonParser();
		this.streamParser = new NdjsonParser();

		// Reject all pending requests
		for (const [id, pending] of this.pendingRequests.entries()) {
			clearTimeout(pending.timeoutId);
			pending.reject(new Error("Connection lost"));
			this.pendingRequests.delete(id);
		}

		if (emitDisconnected) {
			this.emit("disconnected");
		}
	}

	private readAuthToken(): string {
		if (!existsSync(TOKEN_PATH)) {
			throw new Error("Auth token not found - daemon may not be running");
		}

		return readFileSync(TOKEN_PATH, "utf-8").trim();
	}

	private isProtocolMismatchError(error: unknown): boolean {
		return (
			error instanceof Error && error.message.startsWith("PROTOCOL_MISMATCH:")
		);
	}

	private async authenticateControl({
		token,
	}: {
		token: string;
	}): Promise<void> {
		const response = await this.sendRequest<HelloResponse>("hello", {
			token,
			protocolVersion: PROTOCOL_VERSION,
			clientId: this.clientId,
			role: "control",
		});

		if (response.protocolVersion !== PROTOCOL_VERSION) {
			throw new Error(
				`Protocol version mismatch: client=${PROTOCOL_VERSION}, daemon=${response.protocolVersion}`,
			);
		}

		this.controlAuthenticated = true;
	}

	private async authenticateStream({
		token,
	}: {
		token: string;
	}): Promise<void> {
		const response = await this.sendRequestOnStream<HelloResponse>({
			type: "hello",
			payload: {
				token,
				protocolVersion: PROTOCOL_VERSION,
				clientId: this.clientId,
				role: "stream",
			},
		});

		if (response.protocolVersion !== PROTOCOL_VERSION) {
			throw new Error(
				`Protocol version mismatch: client=${PROTOCOL_VERSION}, daemon=${response.protocolVersion}`,
			);
		}

		this.streamAuthenticated = true;
	}

	/**
	 * Send a request on the stream socket and wait for response.
	 *
	 * ORDERING ASSUMPTION: The daemon's hello handler writes the response synchronously
	 * and only broadcasts to authenticated/registered stream sockets, so the response
	 * is guaranteed to be the first frame. Any additional data in the same TCP read
	 * (e.g., events that arrive immediately after auth) is fed to streamParser.
	 *
	 * If the daemon ever changes to emit events before the hello response, this method
	 * would need to parse NDJSON frames in a loop until the matching id is found.
	 */
	private async sendRequestOnStream<T>({
		type,
		payload,
	}: {
		type: string;
		payload: unknown;
	}): Promise<T> {
		return new Promise<T>((resolve, reject) => {
			if (!this.streamSocket) {
				reject(new Error("Stream socket not connected"));
				return;
			}

			const id = `stream_req_${++this.requestCounter}`;
			let buffer = "";

			const timeoutId = setTimeout(() => {
				this.streamSocket?.off("data", onData);
				reject(new Error(`Request timeout: ${type}`));
			}, REQUEST_TIMEOUT_MS);

			const onData = (data: string) => {
				buffer += data;
				const newlineIndex = buffer.indexOf("\n");
				if (newlineIndex === -1) return;

				const line = buffer.slice(0, newlineIndex);
				const remainder = buffer.slice(newlineIndex + 1);
				this.streamSocket?.off("data", onData);
				clearTimeout(timeoutId);

				try {
					const message = JSON.parse(line) as IpcResponse;
					if (!("id" in message) || message.id !== id) {
						reject(new Error("Unexpected stream response"));
						return;
					}

					// Feed any remainder data to the streamParser so events
					// arriving in the same TCP read as the response aren't lost
					if (remainder) {
						const messages = this.streamParser.parse(remainder);
						for (const msg of messages) {
							this.handleMessage(msg);
						}
					}

					if (message.ok) {
						resolve(message.payload as T);
					} else {
						reject(
							new Error(`${message.error.code}: ${message.error.message}`),
						);
					}
				} catch {
					reject(new Error("Failed to parse stream response"));
				}
			};

			this.streamSocket.on("data", onData);

			const message = `${JSON.stringify({ id, type, payload })}\n`;
			this.streamSocket.write(message);
		});
	}

	private async shutdownLegacyDaemon({
		killSessions = true,
	}: {
		killSessions?: boolean;
	} = {}): Promise<void> {
		if (!existsSync(SOCKET_PATH)) return;

		const token = this.readAuthToken();

		await new Promise<void>((resolve, reject) => {
			const socket = connect(SOCKET_PATH);
			let settled = false;

			const timeoutId = setTimeout(() => {
				if (settled) return;
				settled = true;
				socket.destroy();
				reject(new Error("Legacy daemon connect timeout"));
			}, CONNECT_TIMEOUT_MS);

			socket.on("connect", () => {
				if (settled) return;
				clearTimeout(timeoutId);
				socket.setEncoding("utf-8");

				const sendAndWait = (request: {
					id: string;
					type: string;
					payload: unknown;
				}): Promise<IpcResponse> =>
					new Promise((res, rej) => {
						let buffer = "";
						const onData = (data: string) => {
							buffer += data;
							const newlineIndex = buffer.indexOf("\n");
							if (newlineIndex === -1) return;
							socket.off("data", onData);
							try {
								res(JSON.parse(buffer.slice(0, newlineIndex)) as IpcResponse);
							} catch {
								rej(new Error("Failed to parse legacy response"));
							}
						};
						socket.on("data", onData);
						socket.write(`${JSON.stringify(request)}\n`);
					});

				(async () => {
					try {
						const helloId = `legacy_hello_${Date.now()}`;
						const hello = await sendAndWait({
							id: helloId,
							type: "hello",
							payload: {
								token,
								protocolVersion: 1,
								clientId: this.clientId,
								role: "control",
							},
						});
						if (!hello.ok) {
							throw new Error(
								`Legacy hello failed: ${hello.error.code}: ${hello.error.message}`,
							);
						}

						const shutdownId = `legacy_shutdown_${Date.now()}`;
						await sendAndWait({
							id: shutdownId,
							type: "shutdown",
							payload: { killSessions },
						});

						settled = true;
						socket.destroy();
						resolve();
					} catch (error) {
						settled = true;
						socket.destroy();
						reject(error instanceof Error ? error : new Error(String(error)));
					}
				})().catch(() => {
					// Errors handled above
				});
			});

			socket.on("error", (error) => {
				if (settled) return;
				settled = true;
				clearTimeout(timeoutId);
				reject(error);
			});
		});
	}

	private async waitForDaemonShutdown(): Promise<void> {
		const startTime = Date.now();
		const timeoutMs = 2000;

		while (Date.now() - startTime < timeoutMs) {
			if (!existsSync(SOCKET_PATH)) return;
			const live = await this.isSocketLive();
			if (!live) return;
			await this.sleep(100);
		}
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
			try {
				chmodSync(SUPERSET_HOME_DIR, 0o700);
			} catch {
				// Best-effort.
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
				if (DEBUG_CLIENT) {
					console.log("[TerminalHostClient] Socket is live, daemon is running");
				}
				return;
			}

			// Socket exists but not responsive - safe to remove
			if (DEBUG_CLIENT) {
				console.log("[TerminalHostClient] Removing stale socket file");
			}
			try {
				unlinkSync(SOCKET_PATH);
			} catch {
				// Ignore - might not have permission
			}
		}

		// Also clean up stale PID file if socket was not live
		// This handles the case where daemon crashed and PID was reused
		if (existsSync(PID_PATH)) {
			if (DEBUG_CLIENT) {
				console.log("[TerminalHostClient] Removing stale PID file");
			}
			try {
				unlinkSync(PID_PATH);
			} catch {
				// Ignore - might not have permission
			}
		}

		// Acquire spawn lock to prevent concurrent spawns
		if (!this.acquireSpawnLock()) {
			if (DEBUG_CLIENT) {
				console.log(
					"[TerminalHostClient] Another spawn in progress, waiting...",
				);
			}
			// Wait for the other spawn to complete
			await this.waitForDaemon();
			return;
		}

		try {
			// Get path to daemon script
			const daemonScript = this.getDaemonScriptPath();
			if (DEBUG_CLIENT) {
				console.log(`[TerminalHostClient] Daemon script path: ${daemonScript}`);
				console.log(
					`[TerminalHostClient] Script exists: ${existsSync(daemonScript)}`,
				);
			}

			if (!existsSync(daemonScript)) {
				throw new Error(`Daemon script not found: ${daemonScript}`);
			}

			if (DEBUG_CLIENT) {
				console.log(
					`[TerminalHostClient] Spawning daemon with execPath: ${process.execPath}`,
				);
			}

			// Open log file for daemon output (helps debug daemon-side issues)
			const logPath = join(SUPERSET_HOME_DIR, "daemon.log");
			let logFd: number;
			try {
				if (existsSync(logPath)) {
					try {
						const { size } = statSync(logPath);
						if (size > MAX_DAEMON_LOG_BYTES) {
							writeFileSync(logPath, "", { mode: 0o600 });
						}
					} catch {
						// Best-effort.
					}
				}
				logFd = openSync(logPath, "a", 0o600);
				try {
					chmodSync(logPath, 0o600);
				} catch {
					// Best-effort.
				}
			} catch (error) {
				console.warn(
					`[TerminalHostClient] Failed to open daemon log file: ${error}`,
				);
				// Fall back to ignoring output if we can't open log file
				logFd = -1;
			}

			// Spawn daemon as detached process
			let child: ReturnType<typeof spawn> | null = null;
			try {
				child = spawn(process.execPath, [daemonScript], {
					detached: true,
					stdio: logFd >= 0 ? ["ignore", logFd, logFd] : "ignore",
					env: {
						...process.env,
						ELECTRON_RUN_AS_NODE: "1",
						NODE_ENV: process.env.NODE_ENV,
					},
				});
			} finally {
				if (logFd >= 0) {
					try {
						closeSync(logFd);
					} catch {
						// Best-effort.
					}
				}
			}

			if (!child) {
				throw new Error("Failed to spawn daemon");
			}

			if (DEBUG_CLIENT) {
				console.log(
					`[TerminalHostClient] Daemon spawned with PID: ${child.pid}`,
				);
			}

			// Unref to allow parent to exit independently
			child.unref();

			// Wait for daemon to start
			if (DEBUG_CLIENT) {
				console.log("[TerminalHostClient] Waiting for daemon to start...");
			}
			await this.waitForDaemon();
			if (DEBUG_CLIENT) {
				console.log("[TerminalHostClient] Daemon started successfully");
			}
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
	private sendRequest<T>(type: string, payload: unknown): Promise<T> {
		return new Promise<T>((resolve, reject) => {
			if (!this.controlSocket) {
				reject(new Error("Not connected"));
				return;
			}

			const id = `req_${++this.requestCounter}`;

			const timeoutId = setTimeout(() => {
				this.pendingRequests.delete(id);
				reject(new Error(`Request timeout: ${type}`));
			}, REQUEST_TIMEOUT_MS);

			// Cast resolve to unknown handler - safe because response type matches T
			this.pendingRequests.set(id, {
				resolve: resolve as (value: unknown) => void,
				reject,
				timeoutId,
			});

			const message = `${JSON.stringify({ id, type, payload })}\n`;
			this.controlSocket.write(message);
		});
	}

	/**
	 * Send a notification (no pending request / no timeout).
	 *
	 * Used for high-frequency messages like terminal input, where request/response
	 * overhead can cause timeouts under load and drop data. The daemon may still
	 * send a response for compatibility, but this client will ignore it.
	 *
	 * Returns false if queue is full (caller should handle).
	 */
	private sendNotification(type: string, payload: unknown): boolean {
		if (!this.controlSocket) return false;

		const id = `notify_${++this.requestCounter}`;
		const message = `${JSON.stringify({ id, type, payload })}\n`;
		const messageBytes = Buffer.byteLength(message, "utf8");

		// Check queue limit to prevent OOM under backpressure
		if (this.notifyQueueBytes + messageBytes > MAX_NOTIFY_QUEUE_BYTES) {
			return false;
		}

		// If we're already backpressured, just queue.
		if (this.notifyDrainArmed || this.notifyQueue.length > 0) {
			this.notifyQueue.push(message);
			this.notifyQueueBytes += messageBytes;
			return true;
		}

		const canWrite = this.controlSocket.write(message);
		if (!canWrite) {
			// Message is queued internally by the socket; arm drain to flush any
			// subsequent notifications we enqueue.
			this.notifyDrainArmed = true;
		}
		return true;
	}

	private flushNotifyQueue(): void {
		if (!this.controlSocket) return;
		if (!this.notifyDrainArmed && this.notifyQueue.length === 0) return;

		this.notifyDrainArmed = false;

		while (this.notifyQueue.length > 0) {
			const message = this.notifyQueue.shift();
			if (!message) break;
			this.notifyQueueBytes -= Buffer.byteLength(message, "utf8");

			const canWrite = this.controlSocket.write(message);
			if (!canWrite) {
				this.notifyDrainArmed = true;
				return;
			}
		}
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
		const response = await this.sendRequest<CreateOrAttachResponse>(
			"createOrAttach",
			request,
		);
		// Version skew: older daemons may not return pid - normalize undefined → null
		return { ...response, pid: response.pid ?? null };
	}

	/**
	 * Write data to a terminal session
	 */
	async write(request: WriteRequest): Promise<EmptyResponse> {
		await this.ensureConnected();
		return this.sendRequest<EmptyResponse>("write", request);
	}

	/**
	 * Write data without waiting for a response (best-effort, backpressured).
	 * Prevents large pastes from timing out and dropping chunks when the daemon
	 * is busy processing output.
	 */
	writeNoAck(request: WriteRequest): void {
		void this.ensureConnected()
			.then(() => {
				const sent = this.sendNotification("write", request);
				if (!sent) {
					// Queue full - notify the session so it can surface the error to the user
					this.emit(
						"terminalError",
						request.sessionId,
						"Write queue full - input dropped",
						"WRITE_QUEUE_FULL",
					);
				}
			})
			.catch((error) => {
				this.emit(
					"error",
					error instanceof Error ? error : new Error(String(error)),
				);
			});
	}

	/**
	 * Resize a terminal session
	 */
	async resize(request: ResizeRequest): Promise<EmptyResponse> {
		await this.ensureConnected();
		return this.sendRequest<EmptyResponse>("resize", request);
	}

	/**
	 * Detach from a terminal session
	 */
	async detach(request: DetachRequest): Promise<EmptyResponse> {
		await this.ensureConnected();
		return this.sendRequest<EmptyResponse>("detach", request);
	}

	/**
	 * Send a signal to a terminal session (e.g., SIGINT for Ctrl+C)
	 */
	async signal(request: SignalRequest): Promise<EmptyResponse> {
		await this.ensureConnected();
		return this.sendRequest<EmptyResponse>("signal", request);
	}

	/**
	 * Kill a terminal session
	 */
	async kill(request: KillRequest): Promise<EmptyResponse> {
		await this.ensureConnected();
		return this.sendRequest<EmptyResponse>("kill", request);
	}

	/**
	 * Kill all terminal sessions
	 */
	async killAll(request: KillAllRequest): Promise<EmptyResponse> {
		await this.ensureConnected();
		return this.sendRequest<EmptyResponse>("killAll", request);
	}

	/**
	 * List all sessions
	 */
	async listSessions(): Promise<ListSessionsResponse> {
		await this.ensureConnected();
		const response = await this.sendRequest<ListSessionsResponse>(
			"listSessions",
			undefined,
		);
		// Version skew: older daemons may not return pid - normalize undefined → null
		return {
			sessions: response.sessions.map((s) => ({ ...s, pid: s.pid ?? null })),
		};
	}

	/**
	 * Clear scrollback for a session
	 */
	async clearScrollback(
		request: ClearScrollbackRequest,
	): Promise<EmptyResponse> {
		await this.ensureConnected();
		return this.sendRequest<EmptyResponse>("clearScrollback", request);
	}

	/**
	 * Shutdown the daemon gracefully.
	 * After calling this, the client should be disposed and a new daemon
	 * will be spawned on the next getTerminalHostClient() call.
	 */
	async shutdown(request: ShutdownRequest = {}): Promise<EmptyResponse> {
		await this.ensureConnected();
		const response = await this.sendRequest<EmptyResponse>("shutdown", request);
		// Disconnect after shutdown request is sent
		this.disconnect();
		return response;
	}

	/**
	 * Shutdown the daemon if it's currently running, without spawning a new one.
	 * Returns true if daemon was running and shutdown was sent, false if no daemon was running.
	 * This is useful for cleanup operations that should only affect existing daemons.
	 */
	async shutdownIfRunning(
		request: ShutdownRequest = {},
	): Promise<{ wasRunning: boolean }> {
		// Avoid spawning a daemon if none exists.
		const connected = await this.tryConnectControl();
		if (!connected) return { wasRunning: false };

		try {
			const token = this.readAuthToken();
			try {
				await this.authenticateControl({ token });
			} catch (error) {
				if (this.isProtocolMismatchError(error)) {
					this.resetConnectionState({ emitDisconnected: false });
					await this.shutdownLegacyDaemon({
						killSessions: request.killSessions ?? false,
					});
					return { wasRunning: true };
				}
				throw error;
			}

			await this.sendRequest<EmptyResponse>("shutdown", request);
			return { wasRunning: true };
		} finally {
			this.disconnect();
		}
	}

	/**
	 * Disconnect from daemon (but don't stop it)
	 */
	disconnect(): void {
		// Explicit disconnect should not emit a disconnected event (caller controls UX)
		this.disconnectArmed = true;
		this.resetConnectionState({ emitDisconnected: false });
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
