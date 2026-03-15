import { randomBytes } from "node:crypto";
import {
	chmodSync,
	existsSync,
	readFileSync,
	unlinkSync,
	writeFileSync,
} from "node:fs";
import { createServer, type Server, Socket } from "node:net";
import { resolve } from "node:path";
import {
	ensureSupersetHomeDirExists,
	SUPERSET_SENSITIVE_FILE_MODE,
} from "main/lib/app-environment";
import { resolveDaemonScriptPath } from "main/lib/terminal-host/daemon-client";
import { TERMINAL_SUPERVISOR_RUNTIME_PATHS } from "main/lib/terminal-host/runtime-paths";
import { version as desktopVersion } from "~/package.json";
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
import {
	type DetachedSessionRoute,
	SupervisorSessionRouting,
} from "./session-routing";
import { SupervisorWorkerRegistry } from "./worker-registry";

const SUPERVISOR_VERSION = desktopVersion;

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

function getWorkerSpawnArguments(): string[] {
	if (!process.versions.bun) {
		return [];
	}

	const polyfillPath = resolve(
		__dirname,
		"../terminal-host/xterm-env-polyfill.ts",
	);
	if (!existsSync(polyfillPath)) {
		return [];
	}

	return ["run", "--preload", polyfillPath];
}

function toTerminalErrorCode(
	code: string | undefined,
): TerminalErrorEvent["code"] {
	switch (code) {
		case "WRITE_QUEUE_FULL":
		case "SUBPROCESS_ERROR":
		case "WRITE_FAILED":
		case "UNKNOWN":
			return code;
		default:
			return undefined;
	}
}

export class TerminalSupervisor {
	private readonly clientRegistry = new SupervisorClientRegistry();
	private readonly sessionRouting = new SupervisorSessionRouting();
	private readonly workerRegistry: SupervisorWorkerRegistry;
	private server: Server | null = null;
	private authToken = "";
	private stopping = false;

	constructor(private readonly log: LogFn) {
		this.workerRegistry = new SupervisorWorkerRegistry({
			log,
			workerScriptPath: getWorkerScriptPath(),
			workerSpawnArguments: getWorkerSpawnArguments(),
			onData: (_generation, sessionId, data) => {
				this.forwardEventToAttachedClients({
					type: "event",
					event: "data",
					sessionId,
					payload: { type: "data", data },
				});
			},
			onExit: (generation, sessionId, exitCode, signal) => {
				this.forwardEventToAttachedClients({
					type: "event",
					event: "exit",
					sessionId,
					payload: {
						type: "exit",
						exitCode,
						signal,
					} satisfies TerminalExitEvent,
				});
				this.sessionRouting.markSessionExited(sessionId);
				void this.reapDrainedWorkers().catch((error) => {
					this.log("error", "Failed to retire drained workers after exit", {
						generation,
						sessionId,
						error: error instanceof Error ? error.message : String(error),
					});
				});
			},
			onTerminalError: (_generation, sessionId, error, code) => {
				this.forwardEventToAttachedClients({
					type: "event",
					event: "error",
					sessionId,
					payload: {
						type: "error",
						error,
						code: toTerminalErrorCode(code),
					} satisfies TerminalErrorEvent,
				});
			},
			onDisconnected: (generation) => {
				this.handleWorkerDisconnected(generation);
			},
			onError: (generation, error) => {
				this.log("error", "Worker client error", {
					generation,
					error: error.message,
				});
			},
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

		await new Promise<void>((resolveStart, reject) => {
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
				});
				resolveStart();
			});
		});

		await this.recoverExistingWorkerSessions();
	}

	async stop(): Promise<void> {
		this.stopping = true;
		this.clientRegistry.destroyAll();
		this.sessionRouting.clear();
		this.workerRegistry.clear();

		await new Promise<void>((resolveStop) => {
			if (!this.server) {
				resolveStop();
				return;
			}

			this.server.close(() => {
				this.server = null;
				resolveStop();
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
			await this.workerRegistry.shutdownAllWorkers({ killSessions });
		} catch (error) {
			this.log("error", "Failed to shutdown workers during supervisor stop", {
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
		return new Promise((resolveIsLive) => {
			if (!existsSync(TERMINAL_SUPERVISOR_RUNTIME_PATHS.socketPath)) {
				resolveIsLive(false);
				return;
			}

			const socket = new Socket();
			const timeout = setTimeout(() => {
				socket.destroy();
				resolveIsLive(false);
			}, 1000);

			socket.on("connect", () => {
				clearTimeout(timeout);
				socket.destroy();
				resolveIsLive(true);
			});

			socket.on("error", () => {
				clearTimeout(timeout);
				resolveIsLive(false);
			});

			socket.connect(TERMINAL_SUPERVISOR_RUNTIME_PATHS.socketPath);
		});
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

	private resolveRequestedGeneration(request: HelloRequest): string {
		const preferredGeneration = request.preferredWorkerGeneration?.trim();
		if (preferredGeneration) {
			return preferredGeneration;
		}

		const appVersion = request.appVersion?.trim();
		if (appVersion) {
			return appVersion;
		}

		return desktopVersion;
	}

	private async ensurePreferredWorkerGeneration(
		generation: string,
	): Promise<string> {
		const requestedGeneration = generation.trim() || desktopVersion;
		try {
			await this.workerRegistry.ensurePreferredWorkerGeneration(
				requestedGeneration,
			);
		} catch (error) {
			const fallbackGeneration =
				this.workerRegistry.getFallbackGeneration(requestedGeneration);
			if (!fallbackGeneration) {
				throw error;
			}

			this.log(
				"warn",
				"Failed to promote requested worker generation; keeping existing worker",
				{
					requestedGeneration,
					fallbackGeneration,
					error: error instanceof Error ? error.message : String(error),
				},
			);
			return fallbackGeneration;
		}

		await this.reapDrainedWorkers();
		return requestedGeneration;
	}

	private async getPreferredWorkerGeneration(): Promise<string> {
		const preferredGeneration = this.workerRegistry.getPreferredGeneration();
		if (preferredGeneration) {
			return preferredGeneration;
		}

		const fallbackGeneration = this.workerRegistry.getFallbackGeneration();
		if (fallbackGeneration) {
			return fallbackGeneration;
		}

		return this.ensurePreferredWorkerGeneration(desktopVersion);
	}

	private async recoverExistingWorkerSessions(): Promise<void> {
		try {
			const recoveredWorkers =
				await this.workerRegistry.discoverExistingWorkers();
			if (recoveredWorkers.length === 0) {
				return;
			}

			let recoveredSessions = 0;
			for (const worker of recoveredWorkers) {
				for (const session of worker.sessions) {
					if (!session.isAlive) {
						continue;
					}

					this.sessionRouting.restoreSession({
						sessionId: session.sessionId,
						workerId: worker.generation,
					});
					recoveredSessions += 1;
				}
			}

			this.log("info", "Recovered existing terminal workers", {
				workers: recoveredWorkers.map((worker) => ({
					generation: worker.generation,
					liveSessions: worker.sessions.filter((session) => session.isAlive)
						.length,
				})),
				recoveredSessions,
			});
		} catch (error) {
			this.log("warn", "Failed to recover existing terminal workers", {
				error: error instanceof Error ? error.message : String(error),
			});
		}
	}

	private async getWorkerGenerationForCreateOrAttach(
		sessionId: string,
	): Promise<string> {
		const existingGeneration = this.sessionRouting.getWorkerId(sessionId);
		if (existingGeneration) {
			return existingGeneration;
		}

		return this.getPreferredWorkerGeneration();
	}

	private requireSessionWorkerGeneration(
		socket: Socket,
		id: string,
		sessionId: string,
	): string | null {
		const generation = this.sessionRouting.getWorkerId(sessionId);
		if (generation) {
			return generation;
		}

		sendError(
			socket,
			id,
			"SESSION_NOT_FOUND",
			`No routed session found for ${sessionId}`,
		);
		return null;
	}

	private forwardEventToClientIds(event: IpcEvent, clientIds: string[]): void {
		const message = `${JSON.stringify(event)}\n`;

		for (const clientId of clientIds) {
			const streamSocket = this.clientRegistry.getStreamSocket(clientId);
			if (!streamSocket) continue;

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

	private forwardEventToAttachedClients(event: IpcEvent): void {
		this.forwardEventToClientIds(
			event,
			this.sessionRouting.getAttachedClientIds(event.sessionId),
		);
	}

	private async detachWorkerSessionIfNeeded(
		detachedRoute: DetachedSessionRoute,
	): Promise<void> {
		if (!detachedRoute.shouldDetachWorker) {
			return;
		}
		if (detachedRoute.wasExited) {
			await this.reapDrainedWorkers();
			return;
		}

		const worker = this.workerRegistry.getWorker(detachedRoute.workerId);
		if (!worker) {
			return;
		}

		await worker.client.detach({
			sessionId: detachedRoute.sessionId,
		} satisfies DetachRequest);
		await this.reapDrainedWorkers();
	}

	private async listWorkerSessions(): Promise<ListSessionsResponse> {
		const workerSessions = await this.workerRegistry.listWorkerSessions();

		return {
			sessions: workerSessions.flatMap(({ generation, sessions }) =>
				sessions.map((session) => ({
					...session,
					attachedClients: this.sessionRouting.getAttachedClientCount(
						session.sessionId,
					),
					workerGeneration: generation,
				})),
			),
		};
	}

	private async reapDrainedWorkers(): Promise<void> {
		await this.workerRegistry.shutdownDrainedWorkers({
			hasRoutedSessions: (generation) =>
				this.sessionRouting.hasRoutedSessions(generation),
		});
	}

	private handleWorkerDisconnected(generation: string): void {
		if (this.stopping) return;

		const clearedRoutes = this.sessionRouting.clearWorkerRoutes(generation);
		this.workerRegistry.removeWorker(generation);

		this.log("warn", "Worker disconnected", {
			generation,
			affectedSessions: clearedRoutes.map((route) => route.sessionId),
		});

		for (const route of clearedRoutes) {
			this.forwardEventToClientIds(
				{
					type: "event",
					event: "exit",
					sessionId: route.sessionId,
					payload: {
						type: "exit",
						exitCode: 1,
					} satisfies TerminalExitEvent,
				},
				route.clientIds,
			);
		}
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

		const preferredWorkerGeneration =
			await this.ensurePreferredWorkerGeneration(
				this.resolveRequestedGeneration(request),
			);

		const response: HelloResponse = {
			protocolVersion: PROTOCOL_VERSION,
			daemonVersion: SUPERVISOR_VERSION,
			daemonPid: process.pid,
			preferredWorkerGeneration,
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

				const createOrAttachRequest = payload as CreateOrAttachRequest;
				const generation = await this.getWorkerGenerationForCreateOrAttach(
					createOrAttachRequest.sessionId,
				);
				const response = await this.workerRegistry.withWorker(
					generation,
					(worker) => worker.client.createOrAttach(createOrAttachRequest),
				);
				this.sessionRouting.attachSession({
					sessionId: createOrAttachRequest.sessionId,
					workerId: generation,
					clientId: clientState.clientId,
				});
				sendSuccess(socket, id, {
					...response,
					workerGeneration: generation,
				});
				return;
			}

			case "write": {
				if (!this.requireControlRole(socket, id, clientState, type)) return;
				const writeRequest = payload as WriteRequest;

				if (id.startsWith("notify_")) {
					const generation = this.sessionRouting.getWorkerId(
						writeRequest.sessionId,
					);
					if (!generation) {
						this.log("warn", "Dropping notify write for unknown session", {
							sessionId: writeRequest.sessionId,
						});
						return;
					}

					const worker = this.workerRegistry.getWorker(generation);
					if (!worker) {
						this.log("warn", "Dropping notify write for missing worker", {
							sessionId: writeRequest.sessionId,
							generation,
						});
						return;
					}

					worker.client.writeNoAck(writeRequest);
					return;
				}

				const generation = this.requireSessionWorkerGeneration(
					socket,
					id,
					writeRequest.sessionId,
				);
				if (!generation) return;

				const response = await this.workerRegistry.withWorker(
					generation,
					(worker) => worker.client.write(writeRequest),
				);
				sendSuccess(socket, id, response satisfies EmptyResponse);
				return;
			}

			case "resize": {
				if (!this.requireControlRole(socket, id, clientState, type)) return;
				const resizeRequest = payload as ResizeRequest;
				const generation = this.requireSessionWorkerGeneration(
					socket,
					id,
					resizeRequest.sessionId,
				);
				if (!generation) return;

				const response = await this.workerRegistry.withWorker(
					generation,
					(worker) => worker.client.resize(resizeRequest),
				);
				sendSuccess(socket, id, response satisfies EmptyResponse);
				return;
			}

			case "detach": {
				if (!this.requireControlRole(socket, id, clientState, type)) return;
				const detachRequest = payload as DetachRequest;
				const detachedRoute = this.sessionRouting.detachSession({
					sessionId: detachRequest.sessionId,
					clientId: clientState.clientId,
				});

				if (detachedRoute) {
					await this.detachWorkerSessionIfNeeded(detachedRoute);
				}

				sendSuccess(socket, id, { success: true } satisfies EmptyResponse);
				return;
			}

			case "signal": {
				if (!this.requireControlRole(socket, id, clientState, type)) return;
				const signalRequest = payload as SignalRequest;
				const generation = this.requireSessionWorkerGeneration(
					socket,
					id,
					signalRequest.sessionId,
				);
				if (!generation) return;

				const response = await this.workerRegistry.withWorker(
					generation,
					(worker) => worker.client.signal(signalRequest),
				);
				sendSuccess(socket, id, response satisfies EmptyResponse);
				return;
			}

			case "kill": {
				if (!this.requireControlRole(socket, id, clientState, type)) return;
				const killRequest = payload as KillRequest;
				const generation = this.requireSessionWorkerGeneration(
					socket,
					id,
					killRequest.sessionId,
				);
				if (!generation) return;

				const response = await this.workerRegistry.withWorker(
					generation,
					(worker) => worker.client.kill(killRequest),
				);
				sendSuccess(socket, id, response satisfies EmptyResponse);
				return;
			}

			case "killAll": {
				if (!this.requireControlRole(socket, id, clientState, type)) return;
				const killAllRequest = payload as KillAllRequest;

				await Promise.all(
					this.workerRegistry
						.listWorkers()
						.map((worker) => worker.client.killAll(killAllRequest)),
				);
				sendSuccess(socket, id, { success: true } satisfies EmptyResponse);
				return;
			}

			case "listSessions": {
				if (!this.requireControlRole(socket, id, clientState, type)) return;
				const response = await this.listWorkerSessions();
				sendSuccess(socket, id, response satisfies ListSessionsResponse);
				return;
			}

			case "clearScrollback": {
				if (!this.requireControlRole(socket, id, clientState, type)) return;
				const clearScrollbackRequest = payload as ClearScrollbackRequest;
				const generation = this.requireSessionWorkerGeneration(
					socket,
					id,
					clearScrollbackRequest.sessionId,
				);
				if (!generation) return;

				const response = await this.workerRegistry.withWorker(
					generation,
					(worker) => worker.client.clearScrollback(clearScrollbackRequest),
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

				if (this.clientRegistry.hasClient(clientState.clientId)) {
					return;
				}

				const detachedRoutes = this.sessionRouting.detachClient(
					clientState.clientId,
				);
				for (const detachedRoute of detachedRoutes) {
					if (!detachedRoute.shouldDetachWorker) continue;

					void this.detachWorkerSessionIfNeeded(detachedRoute).catch(
						(error) => {
							this.log(
								"error",
								"Failed to detach worker session on disconnect",
								{
									sessionId: detachedRoute.sessionId,
									workerId: detachedRoute.workerId,
									error: error instanceof Error ? error.message : String(error),
								},
							);
						},
					);
				}
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
