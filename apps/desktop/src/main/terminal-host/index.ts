/**
 * Terminal Host Daemon
 *
 * A persistent background process that owns PTYs and terminal emulator state.
 * This allows terminal sessions to survive app restarts and updates.
 *
 * Run with: ELECTRON_RUN_AS_NODE=1 electron dist/main/terminal-host.js
 *
 * IPC Protocol:
 * - Uses NDJSON (newline-delimited JSON) over Unix domain socket
 * - Socket: ~/.superset/terminal-host.sock
 * - Auth token: ~/.superset/terminal-host.token
 */

import { randomBytes } from "node:crypto";
import {
	chmodSync,
	existsSync,
	mkdirSync,
	readFileSync,
	unlinkSync,
	writeFileSync,
} from "node:fs";
import { createServer, type Server, Socket } from "node:net";
import { homedir } from "node:os";
import { join } from "node:path";
import { SUPERSET_DIR_NAME } from "shared/constants";
import {
	type ClearScrollbackRequest,
	type CreateOrAttachRequest,
	type DetachRequest,
	type HelloRequest,
	type HelloResponse,
	type IpcErrorResponse,
	type IpcEvent,
	type IpcRequest,
	type IpcSuccessResponse,
	type KillAllRequest,
	type KillRequest,
	PROTOCOL_VERSION,
	type ResizeRequest,
	type ShutdownRequest,
	type SignalRequest,
	type TerminalErrorEvent,
	type TerminalExitEvent,
	type WriteRequest,
} from "../lib/terminal-host/types";
import { TerminalHost } from "./terminal-host";

// =============================================================================
// Configuration
// =============================================================================

const DAEMON_VERSION = "1.0.0";

// SUPERSET_DIR_NAME is imported from shared/constants for multi-worktree support
// This allows workspace-specific home directories (e.g., ~/.superset-my-feature)
const SUPERSET_HOME_DIR = join(homedir(), SUPERSET_DIR_NAME);

// Socket and token paths
const SOCKET_PATH = join(SUPERSET_HOME_DIR, "terminal-host.sock");
const TOKEN_PATH = join(SUPERSET_HOME_DIR, "terminal-host.token");
const PID_PATH = join(SUPERSET_HOME_DIR, "terminal-host.pid");

// =============================================================================
// Logging
// =============================================================================

function log(
	level: "info" | "warn" | "error",
	message: string,
	data?: unknown,
) {
	const timestamp = new Date().toISOString();
	const prefix = `[${timestamp}] [terminal-host] [${level.toUpperCase()}]`;
	if (data !== undefined) {
		console.log(`${prefix} ${message}`, data);
	} else {
		console.log(`${prefix} ${message}`);
	}
}

// =============================================================================
// Token Management
// =============================================================================

let authToken: string;

function ensureAuthToken(): string {
	if (existsSync(TOKEN_PATH)) {
		// Read existing token
		return readFileSync(TOKEN_PATH, "utf-8").trim();
	}

	// Generate new token (32 bytes = 64 hex chars)
	const token = randomBytes(32).toString("hex");
	writeFileSync(TOKEN_PATH, token, { mode: 0o600 });
	log("info", "Generated new auth token");
	return token;
}

function validateToken(token: string): boolean {
	return token === authToken;
}

// =============================================================================
// NDJSON Framing
// =============================================================================

class NdjsonParser {
	private buffer = "";

	parse(chunk: string): IpcRequest[] {
		this.buffer += chunk;
		const messages: IpcRequest[] = [];

		let newlineIndex = this.buffer.indexOf("\n");
		while (newlineIndex !== -1) {
			const line = this.buffer.slice(0, newlineIndex);
			this.buffer = this.buffer.slice(newlineIndex + 1);

			if (line.trim()) {
				try {
					messages.push(JSON.parse(line));
				} catch {
					// Truncate and redact potentially sensitive data in error logs
					const maxLen = 100;
					const truncated =
						line.length > maxLen
							? `${line.slice(0, maxLen)}... (truncated)`
							: line;
					// Redact anything that looks like a token or secret
					const redacted = truncated.replace(
						/["']?(?:token|secret|password|key|auth)["']?\s*[:=]\s*["']?[^"'\s,}]+["']?/gi,
						"[REDACTED]",
					);
					log("warn", "Failed to parse NDJSON line", {
						preview: redacted,
						length: line.length,
					});
				}
			}

			newlineIndex = this.buffer.indexOf("\n");
		}

		return messages;
	}
}

function sendResponse(
	socket: Socket,
	response: IpcSuccessResponse | IpcErrorResponse,
) {
	socket.write(`${JSON.stringify(response)}\n`);
}

function sendSuccess(socket: Socket, id: string, payload: unknown) {
	sendResponse(socket, { id, ok: true, payload });
}

function sendError(socket: Socket, id: string, code: string, message: string) {
	sendResponse(socket, { id, ok: false, error: { code, message } });
}

// =============================================================================
// Terminal Host Instance
// =============================================================================

let terminalHost: TerminalHost;

// =============================================================================
// Request Handlers
// =============================================================================

type RequestHandler = (
	socket: Socket,
	id: string,
	payload: unknown,
	clientState: ClientState,
) => void | Promise<void>;

interface ClientState {
	authenticated: boolean;
	clientId?: string;
	role?: "control" | "stream";
}

interface ClientSockets {
	control?: Socket;
	stream?: Socket;
}

const clientsById = new Map<string, ClientSockets>();

function isValidRole(role: unknown): role is "control" | "stream" {
	return role === "control" || role === "stream";
}

function broadcastEventToAllStreamSockets(event: IpcEvent): void {
	const message = `${JSON.stringify(event)}\n`;

	for (const [clientId, sockets] of clientsById.entries()) {
		const streamSocket = sockets.stream;
		if (!streamSocket) continue;

		try {
			streamSocket.write(message);
		} catch {
			// Best-effort cleanup of broken sockets.
			try {
				streamSocket.destroy();
			} catch {
				// ignore
			}
			const { control } = sockets;
			if (control) {
				clientsById.set(clientId, { control });
			} else {
				clientsById.delete(clientId);
			}
		}
	}
}

function getStreamSocketForClient(
	clientState: ClientState,
): Socket | undefined {
	const clientId = clientState.clientId;
	if (!clientId) return undefined;
	return clientsById.get(clientId)?.stream;
}

const handlers: Record<string, RequestHandler> = {
	hello: (socket, id, payload, clientState) => {
		const request = payload as HelloRequest;

		// Validate protocol version
		if (request.protocolVersion !== PROTOCOL_VERSION) {
			sendError(
				socket,
				id,
				"PROTOCOL_MISMATCH",
				`Protocol version mismatch. Expected ${PROTOCOL_VERSION}, got ${request.protocolVersion}`,
			);
			return;
		}

		// Validate token
		if (!validateToken(request.token)) {
			sendError(socket, id, "AUTH_FAILED", "Invalid auth token");
			return;
		}

		// Validate v2 fields
		if (typeof request.clientId !== "string" || request.clientId.length === 0) {
			sendError(socket, id, "INVALID_HELLO", "Missing clientId");
			return;
		}
		if (!isValidRole(request.role)) {
			sendError(socket, id, "INVALID_HELLO", "Invalid role");
			return;
		}

		clientState.authenticated = true;
		clientState.clientId = request.clientId;
		clientState.role = request.role;

		// Register the socket under the clientId/role. Replace any existing socket for
		// the same role to avoid ghost connections that can re-introduce backpressure.
		const existing = clientsById.get(request.clientId) ?? {};
		const previousSocket =
			request.role === "control" ? existing.control : existing.stream;
		if (previousSocket && previousSocket !== socket) {
			try {
				terminalHost.detachFromAllSessions(previousSocket);
				previousSocket.destroy();
			} catch {
				// Best effort cleanup
			}
		}
		const updated: ClientSockets =
			request.role === "control"
				? { ...existing, control: socket }
				: { ...existing, stream: socket };
		clientsById.set(request.clientId, updated);

		const response: HelloResponse = {
			protocolVersion: PROTOCOL_VERSION,
			daemonVersion: DAEMON_VERSION,
			daemonPid: process.pid,
		};

		sendSuccess(socket, id, response);
		log("info", "Client authenticated successfully", {
			clientId: request.clientId,
			role: request.role,
		});
	},

	createOrAttach: async (socket, id, payload, clientState) => {
		if (!clientState.authenticated) {
			sendError(socket, id, "NOT_AUTHENTICATED", "Must authenticate first");
			return;
		}
		if (clientState.role !== "control") {
			sendError(socket, id, "INVALID_ROLE", "createOrAttach requires control");
			return;
		}

		const request = payload as CreateOrAttachRequest;
		log("info", `Creating/attaching session: ${request.sessionId}`);

		try {
			const streamSocket = getStreamSocketForClient(clientState);
			if (!streamSocket) {
				sendError(
					socket,
					id,
					"STREAM_NOT_CONNECTED",
					"Stream socket not connected",
				);
				return;
			}

			const response = await terminalHost.createOrAttach(streamSocket, request);
			sendSuccess(socket, id, response);

			log(
				"info",
				`Session ${request.sessionId} ${response.isNew ? "created" : "attached"}`,
			);
		} catch (error) {
			const message = error instanceof Error ? error.message : "Unknown error";
			sendError(socket, id, "CREATE_ATTACH_FAILED", message);
			log("error", `Failed to create/attach session: ${message}`);
		}
	},

	write: (socket, id, payload, clientState) => {
		if (!clientState.authenticated) {
			sendError(socket, id, "NOT_AUTHENTICATED", "Must authenticate first");
			return;
		}
		if (clientState.role !== "control") {
			sendError(socket, id, "INVALID_ROLE", "write requires control");
			return;
		}

		const request = payload as WriteRequest;

		const isNotify = id.startsWith("notify_");

		try {
			const response = terminalHost.write(request);
			// High-frequency write notifications don't need responses; suppress to avoid
			// saturating the socket and dropping input under load.
			if (!isNotify) {
				sendSuccess(socket, id, response);
			}
		} catch (error) {
			const message = error instanceof Error ? error.message : "Write failed";

			if (isNotify) {
				// Emit a session-scoped error event so the main process can surface it.
				// (No response is sent for notify writes.)
				const streamSocket = getStreamSocketForClient(clientState);
				if (!streamSocket) {
					log("warn", "Notify write failed but no stream socket registered", {
						sessionId: request.sessionId,
						error: message,
					});
					return;
				}
				const event: IpcEvent = {
					type: "event",
					event: "error",
					sessionId: request.sessionId,
					payload: {
						type: "error",
						error: message,
						code: "WRITE_FAILED",
					} satisfies TerminalErrorEvent,
				};
				streamSocket.write(`${JSON.stringify(event)}\n`);
				log("warn", `Write failed for ${request.sessionId}`, {
					error: message,
				});
				return;
			}

			sendError(socket, id, "WRITE_FAILED", message);
		}
	},

	resize: (socket, id, payload, clientState) => {
		if (!clientState.authenticated) {
			sendError(socket, id, "NOT_AUTHENTICATED", "Must authenticate first");
			return;
		}
		if (clientState.role !== "control") {
			sendError(socket, id, "INVALID_ROLE", "resize requires control");
			return;
		}

		const request = payload as ResizeRequest;
		const response = terminalHost.resize(request);
		sendSuccess(socket, id, response);
	},

	detach: (socket, id, payload, clientState) => {
		if (!clientState.authenticated) {
			sendError(socket, id, "NOT_AUTHENTICATED", "Must authenticate first");
			return;
		}
		if (clientState.role !== "control") {
			sendError(socket, id, "INVALID_ROLE", "detach requires control");
			return;
		}

		const request = payload as DetachRequest;
		const streamSocket = getStreamSocketForClient(clientState);
		if (!streamSocket) {
			sendError(
				socket,
				id,
				"STREAM_NOT_CONNECTED",
				"Stream socket not connected",
			);
			return;
		}
		const response = terminalHost.detach(streamSocket, request);
		sendSuccess(socket, id, response);
	},

	kill: (socket, id, payload, clientState) => {
		if (!clientState.authenticated) {
			sendError(socket, id, "NOT_AUTHENTICATED", "Must authenticate first");
			return;
		}
		if (clientState.role !== "control") {
			sendError(socket, id, "INVALID_ROLE", "kill requires control");
			return;
		}

		const request = payload as KillRequest;
		const response = terminalHost.kill(request);
		sendSuccess(socket, id, response);
		log("info", `Session ${request.sessionId} killed`);
	},

	signal: (socket, id, payload, clientState) => {
		if (!clientState.authenticated) {
			sendError(socket, id, "NOT_AUTHENTICATED", "Must authenticate first");
			return;
		}
		if (clientState.role !== "control") {
			sendError(socket, id, "INVALID_ROLE", "signal requires control");
			return;
		}

		const request = payload as SignalRequest;
		const response = terminalHost.signal(request);
		sendSuccess(socket, id, response);
	},

	killAll: (socket, id, payload, clientState) => {
		if (!clientState.authenticated) {
			sendError(socket, id, "NOT_AUTHENTICATED", "Must authenticate first");
			return;
		}
		if (clientState.role !== "control") {
			sendError(socket, id, "INVALID_ROLE", "killAll requires control");
			return;
		}

		const request = payload as KillAllRequest;
		const response = terminalHost.killAll(request);
		sendSuccess(socket, id, response);
		log("info", "All sessions killed");
	},

	listSessions: (socket, id, _payload, clientState) => {
		if (!clientState.authenticated) {
			sendError(socket, id, "NOT_AUTHENTICATED", "Must authenticate first");
			return;
		}
		if (clientState.role !== "control") {
			sendError(socket, id, "INVALID_ROLE", "listSessions requires control");
			return;
		}

		const response = terminalHost.listSessions();
		sendSuccess(socket, id, response);
	},

	clearScrollback: (socket, id, payload, clientState) => {
		if (!clientState.authenticated) {
			sendError(socket, id, "NOT_AUTHENTICATED", "Must authenticate first");
			return;
		}
		if (clientState.role !== "control") {
			sendError(socket, id, "INVALID_ROLE", "clearScrollback requires control");
			return;
		}

		const request = payload as ClearScrollbackRequest;
		const response = terminalHost.clearScrollback(request);
		sendSuccess(socket, id, response);
	},

	shutdown: (socket, id, payload, clientState) => {
		if (!clientState.authenticated) {
			sendError(socket, id, "NOT_AUTHENTICATED", "Must authenticate first");
			return;
		}
		if (clientState.role !== "control") {
			sendError(socket, id, "INVALID_ROLE", "shutdown requires control");
			return;
		}

		const request = payload as ShutdownRequest;
		log("info", "Shutdown requested via IPC", {
			killSessions: request.killSessions,
		});

		// Send success response before shutting down
		sendSuccess(socket, id, { success: true });

		// Kill sessions if requested
		if (request.killSessions) {
			terminalHost.killAll({ deleteHistory: false });
		}

		// Schedule shutdown after a brief delay to allow response to be sent
		setTimeout(() => {
			stopServer().then(() => process.exit(0));
		}, 100);
	},
};

async function handleRequest(
	socket: Socket,
	request: IpcRequest,
	clientState: ClientState,
): Promise<void> {
	const handler = handlers[request.type];

	if (!handler) {
		sendError(
			socket,
			request.id,
			"UNKNOWN_REQUEST",
			`Unknown request type: ${request.type}`,
		);
		return;
	}

	try {
		await handler(socket, request.id, request.payload, clientState);
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		sendError(socket, request.id, "INTERNAL_ERROR", message);
		log("error", `Handler error for ${request.type}`, { error: message });
	}
}

// =============================================================================
// Socket Server
// =============================================================================

let server: Server | null = null;

function handleConnection(socket: Socket) {
	const parser = new NdjsonParser();
	const clientState: ClientState = { authenticated: false };
	const remoteId = `${socket.remoteAddress || "local"}:${Date.now()}`;

	log("info", `Client connected: ${remoteId}`);

	socket.setEncoding("utf-8");

	socket.on("data", (data: string) => {
		const messages = parser.parse(data);
		for (const message of messages) {
			handleRequest(socket, message, clientState).catch((error) => {
				log("error", "Unhandled request error", {
					error: error instanceof Error ? error.message : String(error),
				});
			});
		}
	});

	const handleDisconnect = () => {
		log("info", `Client disconnected: ${remoteId}`);
		// Detach this socket from all sessions it was attached to
		// This is centralized here to avoid per-session socket listeners
		terminalHost.detachFromAllSessions(socket);

		// Remove from client map if this was a registered control/stream socket.
		const { clientId, role } = clientState;
		if (clientId && role) {
			const entry = clientsById.get(clientId);
			if (entry) {
				const matches =
					role === "control"
						? entry.control === socket
						: entry.stream === socket;
				if (matches) {
					const next: ClientSockets = { ...entry };
					if (role === "control") {
						delete next.control;
					} else {
						delete next.stream;
					}
					if (!next.control && !next.stream) {
						clientsById.delete(clientId);
					} else {
						clientsById.set(clientId, next);
					}
				}
			}
		}
	};

	socket.on("close", handleDisconnect);

	socket.on("error", (error) => {
		log("error", `Socket error for ${remoteId}`, { error: error.message });
	});
}

/**
 * Check if there's an active daemon listening on the socket.
 * Returns true if socket is live and responding.
 */
function isSocketLive(): Promise<boolean> {
	return new Promise((resolve) => {
		if (!existsSync(SOCKET_PATH)) {
			resolve(false);
			return;
		}

		const testSocket = new Socket();
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

		testSocket.connect(SOCKET_PATH);
	});
}

async function startServer(): Promise<void> {
	// Ensure superset directory exists with proper permissions
	if (!existsSync(SUPERSET_HOME_DIR)) {
		mkdirSync(SUPERSET_HOME_DIR, { recursive: true, mode: 0o700 });
		log("info", `Created directory: ${SUPERSET_HOME_DIR}`);
	}

	// Ensure directory has correct permissions
	try {
		chmodSync(SUPERSET_HOME_DIR, 0o700);
	} catch {
		// May fail if not owner, that's okay
	}

	// Check if socket is live before removing it
	// This prevents orphaning a running daemon
	if (existsSync(SOCKET_PATH)) {
		const isLive = await isSocketLive();
		if (isLive) {
			log("error", "Another daemon is already running and responsive");
			throw new Error("Another daemon is already running");
		}

		// Socket exists but not responsive - safe to remove
		try {
			unlinkSync(SOCKET_PATH);
			log("info", "Removed stale socket file");
		} catch (error) {
			throw new Error(`Failed to remove stale socket: ${error}`);
		}
	}

	// Clean up stale PID file if socket was removed
	if (existsSync(PID_PATH)) {
		try {
			unlinkSync(PID_PATH);
		} catch {
			// Ignore - may not have permission
		}
	}

	// Initialize auth token
	authToken = ensureAuthToken();

	// Initialize terminal host
	terminalHost = new TerminalHost({
		onUnattachedExit: ({ sessionId, exitCode, signal }) => {
			const event: IpcEvent = {
				type: "event",
				event: "exit",
				sessionId,
				payload: {
					type: "exit",
					exitCode,
					signal,
				} satisfies TerminalExitEvent,
			};

			broadcastEventToAllStreamSockets(event);
		},
	});

	// Create server
	const newServer = createServer(handleConnection);
	server = newServer;

	// Wrap server.listen in a Promise for async/await
	await new Promise<void>((resolve, reject) => {
		newServer.on("error", (error: NodeJS.ErrnoException) => {
			if (error.code === "EADDRINUSE") {
				log("error", "Socket already in use - another daemon may be running");
				reject(new Error("Socket already in use"));
			} else {
				log("error", "Server error", { error: error.message });
				reject(error);
			}
		});

		newServer.listen(SOCKET_PATH, () => {
			// Set socket permissions (readable/writable by owner only)
			try {
				chmodSync(SOCKET_PATH, 0o600);
			} catch {
				// May fail on some systems, that's okay - directory permissions protect us
			}

			// Write PID file
			writeFileSync(PID_PATH, String(process.pid), { mode: 0o600 });

			log("info", `Daemon started`);
			log("info", `Socket: ${SOCKET_PATH}`);
			log("info", `PID: ${process.pid}`);
			resolve();
		});
	});
}

async function stopServer(): Promise<void> {
	if (terminalHost) {
		await terminalHost.dispose();
		log("info", "Terminal host disposed");
	}

	await new Promise<void>((resolve) => {
		if (server) {
			server.close(() => {
				log("info", "Server closed");
				resolve();
			});
		} else {
			resolve();
		}
	});

	try {
		if (existsSync(SOCKET_PATH)) unlinkSync(SOCKET_PATH);
		if (existsSync(PID_PATH)) unlinkSync(PID_PATH);
	} catch {
		// Best effort cleanup
	}
}

// =============================================================================
// Signal Handling
// =============================================================================

function setupSignalHandlers() {
	const shutdown = async (signal: string) => {
		log("info", `Received ${signal}, shutting down...`);
		await stopServer();
		process.exit(0);
	};

	process.on("SIGINT", () => shutdown("SIGINT"));
	process.on("SIGTERM", () => shutdown("SIGTERM"));
	process.on("SIGHUP", () => shutdown("SIGHUP"));

	// Handle uncaught errors
	process.on("uncaughtException", (error) => {
		log("error", "Uncaught exception", {
			error: error.message,
			stack: error.stack,
		});
		stopServer().then(() => process.exit(1));
	});

	process.on("unhandledRejection", (reason) => {
		log("error", "Unhandled rejection", { reason });
		stopServer().then(() => process.exit(1));
	});
}

// =============================================================================
// Main
// =============================================================================

async function main() {
	log("info", "Terminal Host Daemon starting...");
	log("info", `Environment: ${process.env.NODE_ENV || "production"}`);
	log("info", `Home directory: ${SUPERSET_HOME_DIR}`);

	setupSignalHandlers();

	try {
		await startServer();
	} catch (error) {
		log("error", "Failed to start server", { error });
		process.exit(1);
	}
}

main();
