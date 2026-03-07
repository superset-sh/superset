import { randomBytes } from "node:crypto";
import {
	chmodSync,
	existsSync,
	readFileSync,
	unlinkSync,
	writeFileSync,
} from "node:fs";
import { createServer, type Server, Socket } from "node:net";
import {
	ensureSupersetHomeDirExists,
	SUPERSET_SENSITIVE_FILE_MODE,
} from "main/lib/app-environment";
import {
	resolveDaemonScriptPath,
	TerminalDaemonClient,
} from "main/lib/terminal-host/daemon-client";
import {
	TERMINAL_HOST_RUNTIME_PATHS,
	TERMINAL_SUPERVISOR_RUNTIME_PATHS,
} from "main/lib/terminal-host/runtime-paths";
import {
	type ClearScrollbackRequest,
	type CreateOrAttachRequest,
	type DetachRequest,
	type EmptyResponse,
	type HelloRequest,
	type HelloResponse,
	type IpcErrorResponse,
	type IpcEvent,
	type IpcRequest,
	type IpcSuccessResponse,
	type KillAllRequest,
	type KillRequest,
	type ListSessionsResponse,
	PROTOCOL_VERSION,
	type ResizeRequest,
	type ShutdownRequest,
	type SignalRequest,
	type TerminalErrorEvent,
	type TerminalExitEvent,
	type WriteRequest,
} from "../lib/terminal-host/types";
import {
	SupervisorClientRegistry,
	type SupervisorClientRole,
} from "./client-registry";

const SUPERVISOR_VERSION = "1.0.0";

type LogFn = (
	level: "info" | "warn" | "error",
	message: string,
	data?: unknown,
) => void;

interface ClientState {
	authenticated: boolean;
	clientId?: string;
	role?: SupervisorClientRole;
}

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
					console.warn("[terminal-supervisor] Failed to parse NDJSON line");
				}
			}

			newlineIndex = this.buffer.indexOf("\n");
		}

		return messages;
	}
}

function isValidRole(role: unknown): role is SupervisorClientRole {
	return role === "control" || role === "stream";
}

function sendResponse(
	socket: Socket,
	response: IpcSuccessResponse | IpcErrorResponse,
): void {
	socket.write(`${JSON.stringify(response)}\n`);
}

function sendSuccess(socket: Socket, id: string, payload: unknown): void {
	sendResponse(socket, { id, ok: true, payload });
}

function sendError(
	socket: Socket,
	id: string,
	code: string,
	message: string,
): void {
	sendResponse(socket, { id, ok: false, error: { code, message } });
}

function getWorkerScriptPath(): string {
	return resolveDaemonScriptPath({
		moduleDir: __dirname,
		sourceRelativePath: "../terminal-host/index.ts",
		bundledRelativePath: "terminal-host.js",
	});
}

export class TerminalSupervisor {
	private readonly clientRegistry = new SupervisorClientRegistry();
	private readonly workerClient = new TerminalDaemonClient({
		daemonName: "terminal-host",
		daemonScriptPath: getWorkerScriptPath(),
		runtimePaths: TERMINAL_HOST_RUNTIME_PATHS,
	});
	private server: Server | null = null;
	private authToken = "";
	private stopping = false;

	constructor(private readonly log: LogFn) {
		this.workerClient.on("data", (sessionId, data) => {
			this.broadcastEvent({
				type: "event",
				event: "data",
				sessionId,
				payload: { type: "data", data },
			});
		});

		this.workerClient.on("exit", (sessionId, exitCode, signal) => {
			this.broadcastEvent({
				type: "event",
				event: "exit",
				sessionId,
				payload: {
					type: "exit",
					exitCode,
					signal,
				} satisfies TerminalExitEvent,
			});
		});

		this.workerClient.on("terminalError", (sessionId, error, code) => {
			this.broadcastEvent({
				type: "event",
				event: "error",
				sessionId,
				payload: {
					type: "error",
					error,
					code,
				} satisfies TerminalErrorEvent,
			});
		});

		this.workerClient.on("disconnected", () => {
			if (this.stopping) return;
			this.log(
				"warn",
				"Worker disconnected, closing supervisor client sockets",
			);
			this.clientRegistry.destroyAll();
		});

		this.workerClient.on("error", (error) => {
			this.log("error", "Worker client error", {
				error: error.message,
			});
		});
	}

	async start(): Promise<void> {
		ensureSupersetHomeDirExists();

		if (existsSync(TERMINAL_SUPERVISOR_RUNTIME_PATHS.socketPath)) {
			const isLive = await this.isSocketLive();
			if (isLive) {
				throw new Error("Another terminal supervisor is already running");
			}

			try {
				unlinkSync(TERMINAL_SUPERVISOR_RUNTIME_PATHS.socketPath);
				this.log("info", "Removed stale supervisor socket file");
			} catch (error) {
				throw new Error(`Failed to remove stale supervisor socket: ${error}`);
			}
		}

		if (existsSync(TERMINAL_SUPERVISOR_RUNTIME_PATHS.pidPath)) {
			try {
				unlinkSync(TERMINAL_SUPERVISOR_RUNTIME_PATHS.pidPath);
			} catch {
				// Best-effort cleanup.
			}
		}

		this.authToken = this.ensureAuthToken();
		this.server = createServer((socket) => {
			this.handleConnection(socket);
		});

		await new Promise<void>((resolve, reject) => {
			const server = this.server;
			if (!server) {
				reject(new Error("Supervisor server was not initialized"));
				return;
			}

			server.on("error", (error: NodeJS.ErrnoException) => {
				if (error.code === "EADDRINUSE") {
					reject(new Error("Supervisor socket already in use"));
					return;
				}

				reject(error);
			});

			server.listen(TERMINAL_SUPERVISOR_RUNTIME_PATHS.socketPath, () => {
				try {
					chmodSync(
						TERMINAL_SUPERVISOR_RUNTIME_PATHS.socketPath,
						SUPERSET_SENSITIVE_FILE_MODE,
					);
				} catch {
					// Directory permissions protect us even if chmod fails.
				}

				writeFileSync(
					TERMINAL_SUPERVISOR_RUNTIME_PATHS.pidPath,
					String(process.pid),
					{ mode: SUPERSET_SENSITIVE_FILE_MODE },
				);

				this.log("info", "Supervisor started", {
					socket: TERMINAL_SUPERVISOR_RUNTIME_PATHS.socketPath,
					pid: process.pid,
					workerSocket: TERMINAL_HOST_RUNTIME_PATHS.socketPath,
				});
				resolve();
			});
		});
	}

	async stop(): Promise<void> {
		this.stopping = true;
		this.clientRegistry.destroyAll();
		this.workerClient.dispose();

		await new Promise<void>((resolve) => {
			if (!this.server) {
				resolve();
				return;
			}

			this.server.close(() => {
				this.server = null;
				resolve();
			});
		});

		try {
			if (existsSync(TERMINAL_SUPERVISOR_RUNTIME_PATHS.socketPath)) {
				unlinkSync(TERMINAL_SUPERVISOR_RUNTIME_PATHS.socketPath);
			}
			if (existsSync(TERMINAL_SUPERVISOR_RUNTIME_PATHS.pidPath)) {
				unlinkSync(TERMINAL_SUPERVISOR_RUNTIME_PATHS.pidPath);
			}
		} catch {
			// Best-effort cleanup.
		}
	}

	async shutdownWorkerAndStop({
		killSessions,
	}: {
		killSessions: boolean;
	}): Promise<void> {
		try {
			await this.workerClient.shutdownIfRunning({ killSessions });
		} catch (error) {
			this.log("error", "Failed to shutdown worker during supervisor stop", {
				error: error instanceof Error ? error.message : String(error),
			});
		}

		await this.stop();
	}

	private ensureAuthToken(): string {
		if (existsSync(TERMINAL_SUPERVISOR_RUNTIME_PATHS.tokenPath)) {
			return readFileSync(
				TERMINAL_SUPERVISOR_RUNTIME_PATHS.tokenPath,
				"utf-8",
			).trim();
		}

		const token = randomBytes(32).toString("hex");
		writeFileSync(TERMINAL_SUPERVISOR_RUNTIME_PATHS.tokenPath, token, {
			mode: SUPERSET_SENSITIVE_FILE_MODE,
		});
		return token;
	}

	private async isSocketLive(): Promise<boolean> {
		return new Promise((resolve) => {
			if (!existsSync(TERMINAL_SUPERVISOR_RUNTIME_PATHS.socketPath)) {
				resolve(false);
				return;
			}

			const socket = new Socket();
			const timeout = setTimeout(() => {
				socket.destroy();
				resolve(false);
			}, 1000);

			socket.on("connect", () => {
				clearTimeout(timeout);
				socket.destroy();
				resolve(true);
			});

			socket.on("error", () => {
				clearTimeout(timeout);
				resolve(false);
			});

			socket.connect(TERMINAL_SUPERVISOR_RUNTIME_PATHS.socketPath);
		});
	}

	private async ensureWorkerConnected(): Promise<void> {
		await this.workerClient.ensureConnected();
	}

	private requireControlRole(
		socket: Socket,
		id: string,
		clientState: ClientState,
		requestType: string,
	): clientState is ClientState & {
		authenticated: true;
		clientId: string;
		role: "control";
	} {
		if (!clientState.authenticated) {
			sendError(socket, id, "NOT_AUTHENTICATED", "Must authenticate first");
			return false;
		}

		if (clientState.role !== "control" || !clientState.clientId) {
			sendError(socket, id, "INVALID_ROLE", `${requestType} requires control`);
			return false;
		}

		return true;
	}

	private broadcastEvent(event: IpcEvent): void {
		const message = `${JSON.stringify(event)}\n`;

		for (const streamSocket of this.clientRegistry.getAllStreamSockets()) {
			try {
				streamSocket.write(message);
			} catch {
				try {
					streamSocket.destroy();
				} catch {
					// Best-effort cleanup.
				}
			}
		}
	}

	private async proxyRequest<T>(proxy: () => Promise<T>): Promise<T> {
		await this.ensureWorkerConnected();
		return proxy();
	}

	private async handleHello(
		socket: Socket,
		id: string,
		payload: unknown,
		clientState: ClientState,
	): Promise<void> {
		const request = payload as HelloRequest;

		if (request.protocolVersion !== PROTOCOL_VERSION) {
			sendError(
				socket,
				id,
				"PROTOCOL_MISMATCH",
				`Protocol version mismatch. Expected ${PROTOCOL_VERSION}, got ${request.protocolVersion}`,
			);
			return;
		}

		if (request.token !== this.authToken) {
			sendError(socket, id, "AUTH_FAILED", "Invalid auth token");
			return;
		}

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

		const previousSocket = this.clientRegistry.registerSocket({
			clientId: request.clientId,
			role: request.role,
			socket,
		});

		if (previousSocket && previousSocket !== socket) {
			try {
				previousSocket.destroy();
			} catch {
				// Best-effort cleanup.
			}
		}

		const response: HelloResponse = {
			protocolVersion: PROTOCOL_VERSION,
			daemonVersion: SUPERVISOR_VERSION,
			daemonPid: process.pid,
		};

		sendSuccess(socket, id, response);
	}

	private async handleRequest(
		socket: Socket,
		request: IpcRequest,
		clientState: ClientState,
	): Promise<void> {
		const { id, type, payload } = request;

		switch (type) {
			case "hello":
				await this.handleHello(socket, id, payload, clientState);
				return;

			case "createOrAttach": {
				if (!this.requireControlRole(socket, id, clientState, type)) return;
				if (!this.clientRegistry.getStreamSocket(clientState.clientId)) {
					sendError(
						socket,
						id,
						"STREAM_NOT_CONNECTED",
						"Stream socket not connected",
					);
					return;
				}

				const response = await this.proxyRequest(() =>
					this.workerClient.createOrAttach(payload as CreateOrAttachRequest),
				);
				sendSuccess(socket, id, response);
				return;
			}

			case "write": {
				if (!this.requireControlRole(socket, id, clientState, type)) return;
				const writeRequest = payload as WriteRequest;

				if (id.startsWith("notify_")) {
					await this.ensureWorkerConnected();
					this.workerClient.writeNoAck(writeRequest);
					return;
				}

				const response = await this.proxyRequest(() =>
					this.workerClient.write(writeRequest),
				);
				sendSuccess(socket, id, response satisfies EmptyResponse);
				return;
			}

			case "resize": {
				if (!this.requireControlRole(socket, id, clientState, type)) return;
				const response = await this.proxyRequest(() =>
					this.workerClient.resize(payload as ResizeRequest),
				);
				sendSuccess(socket, id, response satisfies EmptyResponse);
				return;
			}

			case "detach": {
				if (!this.requireControlRole(socket, id, clientState, type)) return;
				if (!this.clientRegistry.getStreamSocket(clientState.clientId)) {
					sendError(
						socket,
						id,
						"STREAM_NOT_CONNECTED",
						"Stream socket not connected",
					);
					return;
				}

				const response = await this.proxyRequest(() =>
					this.workerClient.detach(payload as DetachRequest),
				);
				sendSuccess(socket, id, response satisfies EmptyResponse);
				return;
			}

			case "signal": {
				if (!this.requireControlRole(socket, id, clientState, type)) return;
				const response = await this.proxyRequest(() =>
					this.workerClient.signal(payload as SignalRequest),
				);
				sendSuccess(socket, id, response satisfies EmptyResponse);
				return;
			}

			case "kill": {
				if (!this.requireControlRole(socket, id, clientState, type)) return;
				const response = await this.proxyRequest(() =>
					this.workerClient.kill(payload as KillRequest),
				);
				sendSuccess(socket, id, response satisfies EmptyResponse);
				return;
			}

			case "killAll": {
				if (!this.requireControlRole(socket, id, clientState, type)) return;
				const response = await this.proxyRequest(() =>
					this.workerClient.killAll(payload as KillAllRequest),
				);
				sendSuccess(socket, id, response satisfies EmptyResponse);
				return;
			}

			case "listSessions": {
				if (!this.requireControlRole(socket, id, clientState, type)) return;
				const response = await this.proxyRequest(() =>
					this.workerClient.listSessions(),
				);
				sendSuccess(socket, id, response satisfies ListSessionsResponse);
				return;
			}

			case "clearScrollback": {
				if (!this.requireControlRole(socket, id, clientState, type)) return;
				const response = await this.proxyRequest(() =>
					this.workerClient.clearScrollback(payload as ClearScrollbackRequest),
				);
				sendSuccess(socket, id, response satisfies EmptyResponse);
				return;
			}

			case "shutdown": {
				if (!this.requireControlRole(socket, id, clientState, type)) return;
				const shutdownRequest = payload as ShutdownRequest;
				sendSuccess(socket, id, { success: true } satisfies EmptyResponse);

				setTimeout(() => {
					this.shutdownWorkerAndStop({
						killSessions: shutdownRequest.killSessions ?? false,
					})
						.then(() => process.exit(0))
						.catch((error) => {
							this.log("error", "Supervisor shutdown failed", {
								error: error instanceof Error ? error.message : String(error),
							});
							process.exit(1);
						});
				}, 100);
				return;
			}

			default:
				sendError(
					socket,
					id,
					"UNKNOWN_REQUEST",
					`Unknown request type: ${type}`,
				);
		}
	}

	private handleConnection(socket: Socket): void {
		const parser = new NdjsonParser();
		const clientState: ClientState = { authenticated: false };
		const remoteId = `${socket.remoteAddress || "local"}:${Date.now()}`;

		this.log("info", "Client connected", { remoteId });
		socket.setEncoding("utf-8");

		socket.on("data", (data: string) => {
			for (const message of parser.parse(data)) {
				this.handleRequest(socket, message, clientState).catch((error) => {
					sendError(
						socket,
						message.id,
						"INTERNAL_ERROR",
						error instanceof Error ? error.message : String(error),
					);
					this.log("error", "Unhandled supervisor request error", {
						type: message.type,
						error: error instanceof Error ? error.message : String(error),
					});
				});
			}
		});

		const handleDisconnect = () => {
			this.log("info", "Client disconnected", { remoteId });
			if (clientState.clientId && clientState.role) {
				this.clientRegistry.removeSocket({
					clientId: clientState.clientId,
					role: clientState.role,
					socket,
				});
			}
		};

		socket.on("close", handleDisconnect);
		socket.on("error", (error) => {
			this.log("error", "Supervisor client socket error", {
				remoteId,
				error: error.message,
			});
		});
	}
}
