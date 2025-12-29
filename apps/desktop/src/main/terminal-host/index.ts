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
import { createServer, type Server, type Socket } from "node:net";
import { homedir } from "node:os";
import { join } from "node:path";
import {
	type ClearScrollbackRequest,
	type CreateOrAttachRequest,
	type DetachRequest,
	type HelloRequest,
	type HelloResponse,
	type IpcErrorResponse,
	type IpcRequest,
	type IpcSuccessResponse,
	type KillAllRequest,
	type KillRequest,
	PROTOCOL_VERSION,
	type ResizeRequest,
	type WriteRequest,
} from "../lib/terminal-host/types";
import { TerminalHost } from "./terminal-host";

// =============================================================================
// Configuration
// =============================================================================

const DAEMON_VERSION = "1.0.0";

// Determine superset directory based on NODE_ENV
const SUPERSET_DIR_NAME =
	process.env.NODE_ENV === "development" ? ".superset-dev" : ".superset";
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
					log("warn", "Failed to parse NDJSON line", { line });
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
) => void;

interface ClientState {
	authenticated: boolean;
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

		clientState.authenticated = true;

		const response: HelloResponse = {
			protocolVersion: PROTOCOL_VERSION,
			daemonVersion: DAEMON_VERSION,
			daemonPid: process.pid,
		};

		sendSuccess(socket, id, response);
		log("info", "Client authenticated successfully");
	},

	createOrAttach: (socket, id, payload, clientState) => {
		if (!clientState.authenticated) {
			sendError(socket, id, "NOT_AUTHENTICATED", "Must authenticate first");
			return;
		}

		const request = payload as CreateOrAttachRequest;
		log("info", `Creating/attaching session: ${request.sessionId}`);

		const response = terminalHost.createOrAttach(socket, request);
		sendSuccess(socket, id, response);

		log(
			"info",
			`Session ${request.sessionId} ${response.isNew ? "created" : "attached"}`,
		);
	},

	write: (socket, id, payload, clientState) => {
		if (!clientState.authenticated) {
			sendError(socket, id, "NOT_AUTHENTICATED", "Must authenticate first");
			return;
		}

		const request = payload as WriteRequest;
		const response = terminalHost.write(request);
		sendSuccess(socket, id, response);
	},

	resize: (socket, id, payload, clientState) => {
		if (!clientState.authenticated) {
			sendError(socket, id, "NOT_AUTHENTICATED", "Must authenticate first");
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

		const request = payload as DetachRequest;
		const response = terminalHost.detach(socket, request);
		sendSuccess(socket, id, response);
	},

	kill: (socket, id, payload, clientState) => {
		if (!clientState.authenticated) {
			sendError(socket, id, "NOT_AUTHENTICATED", "Must authenticate first");
			return;
		}

		const request = payload as KillRequest;
		const response = terminalHost.kill(request);
		sendSuccess(socket, id, response);
		log("info", `Session ${request.sessionId} killed`);
	},

	killAll: (socket, id, payload, clientState) => {
		if (!clientState.authenticated) {
			sendError(socket, id, "NOT_AUTHENTICATED", "Must authenticate first");
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

		const response = terminalHost.listSessions();
		sendSuccess(socket, id, response);
	},

	clearScrollback: (socket, id, payload, clientState) => {
		if (!clientState.authenticated) {
			sendError(socket, id, "NOT_AUTHENTICATED", "Must authenticate first");
			return;
		}

		const request = payload as ClearScrollbackRequest;
		const response = terminalHost.clearScrollback(request);
		sendSuccess(socket, id, response);
	},
};

function handleRequest(
	socket: Socket,
	request: IpcRequest,
	clientState: ClientState,
) {
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
		handler(socket, request.id, request.payload, clientState);
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
			handleRequest(socket, message, clientState);
		}
	});

	socket.on("close", () => {
		log("info", `Client disconnected: ${remoteId}`);
	});

	socket.on("error", (error) => {
		log("error", `Socket error for ${remoteId}`, { error: error.message });
	});
}

function startServer(): Promise<void> {
	return new Promise((resolve, reject) => {
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

		// Remove stale socket if it exists
		if (existsSync(SOCKET_PATH)) {
			try {
				unlinkSync(SOCKET_PATH);
				log("info", "Removed stale socket file");
			} catch (error) {
				reject(new Error(`Failed to remove stale socket: ${error}`));
				return;
			}
		}

		// Initialize auth token
		authToken = ensureAuthToken();

		// Initialize terminal host
		terminalHost = new TerminalHost();

		// Create server
		server = createServer(handleConnection);

		server.on("error", (error: NodeJS.ErrnoException) => {
			if (error.code === "EADDRINUSE") {
				log("error", "Socket already in use - another daemon may be running");
				reject(new Error("Socket already in use"));
			} else {
				log("error", "Server error", { error: error.message });
				reject(error);
			}
		});

		server.listen(SOCKET_PATH, () => {
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

function stopServer(): Promise<void> {
	return new Promise((resolve) => {
		// Dispose terminal host (kills all sessions)
		if (terminalHost) {
			terminalHost.dispose();
			log("info", "Terminal host disposed");
		}

		if (server) {
			server.close(() => {
				log("info", "Server closed");
				resolve();
			});
		} else {
			resolve();
		}

		// Clean up socket and PID files
		try {
			if (existsSync(SOCKET_PATH)) unlinkSync(SOCKET_PATH);
			if (existsSync(PID_PATH)) unlinkSync(PID_PATH);
		} catch {
			// Best effort cleanup
		}
	});
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
