import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import type { ChildProcess } from "node:child_process";
import { spawn } from "node:child_process";
import {
	existsSync,
	mkdirSync,
	mkdtempSync,
	readdirSync,
	readFileSync,
	rmSync,
} from "node:fs";
import { connect, type Socket } from "node:net";
import { join, resolve } from "node:path";
import {
	type HelloResponse,
	type IpcRequest,
	type IpcResponse,
	PROTOCOL_VERSION,
} from "../lib/terminal-host/types";
import { supportsLocalSocketBinding } from "../terminal-host/test-helpers";

const SUPERSET_DIR_NAME = ".superset-test-supervisor";
const TEST_HOME_DIR = mkdtempSync("/tmp/sts-");
const SUPERSET_HOME_DIR = join(TEST_HOME_DIR, SUPERSET_DIR_NAME);

const SUPERVISOR_SOCKET_PATH = join(
	SUPERSET_HOME_DIR,
	"terminal-supervisor.sock",
);
const SUPERVISOR_TOKEN_PATH = join(
	SUPERSET_HOME_DIR,
	"terminal-supervisor.token",
);

const SUPERVISOR_PATH = resolve(__dirname, "index.ts");

const PROCESS_TIMEOUT_MS = 10_000;
const SOCKET_TIMEOUT_MS = 5_000;
const MESSAGE_TIMEOUT_MS = 15_000;

function cleanupPath(path: string): void {
	if (!existsSync(path)) return;

	try {
		rmSync(path);
	} catch {
		// Best-effort cleanup.
	}
}

function cleanupArtifacts(): void {
	if (!existsSync(SUPERSET_HOME_DIR)) return;

	for (const entry of readdirSync(SUPERSET_HOME_DIR)) {
		if (
			!entry.startsWith("terminal-supervisor") &&
			!entry.startsWith("terminal-worker.") &&
			!entry.startsWith("terminal-host")
		) {
			continue;
		}

		const path = join(SUPERSET_HOME_DIR, entry);
		cleanupPath(path);
	}
}

function getWorkerSocketPath(generation: string): string {
	return join(SUPERSET_HOME_DIR, `terminal-worker.${generation}.sock`);
}

function killRuntimePids(): void {
	if (!existsSync(SUPERSET_HOME_DIR)) return;

	for (const entry of readdirSync(SUPERSET_HOME_DIR)) {
		if (!entry.endsWith(".pid")) continue;
		if (
			!entry.startsWith("terminal-supervisor") &&
			!entry.startsWith("terminal-worker.") &&
			!entry.startsWith("terminal-host")
		) {
			continue;
		}

		killPidFile(join(SUPERSET_HOME_DIR, entry));
	}
}

function killPidFile(path: string): void {
	if (!existsSync(path)) return;

	try {
		const pid = Number.parseInt(readFileSync(path, "utf-8").trim(), 10);
		if (pid > 0) {
			process.kill(pid, "SIGTERM");
		}
	} catch {
		// Process already exited or pid file was stale.
	}
}

function connectToSocket(socketPath: string): Promise<Socket> {
	return new Promise((resolve, reject) => {
		const socket = connect(socketPath);

		const timeoutId = setTimeout(() => {
			socket.destroy();
			reject(new Error(`Connection timed out for ${socketPath}`));
		}, SOCKET_TIMEOUT_MS);

		socket.on("connect", () => {
			clearTimeout(timeoutId);
			socket.setEncoding("utf-8");
			resolve(socket);
		});

		socket.on("error", (error) => {
			clearTimeout(timeoutId);
			reject(error);
		});
	});
}

function waitForLogLine(
	processHandle: ChildProcess,
	matcher: string,
	label: string,
): Promise<void> {
	return new Promise((resolve, reject) => {
		let stdoutBuffer = "";
		let stderrBuffer = "";
		let settled = false;

		const finish = (fn: () => void) => {
			if (settled) return;
			settled = true;
			clearTimeout(timeoutId);
			processHandle.stdout?.off("data", onStdout);
			processHandle.stderr?.off("data", onStderr);
			processHandle.off("exit", onExit);
			processHandle.off("error", onError);
			fn();
		};

		const onStdout = (data: Buffer | string) => {
			stdoutBuffer += data.toString();
			if (stdoutBuffer.includes(matcher)) {
				finish(resolve);
			}
		};

		const onStderr = (data: Buffer | string) => {
			stderrBuffer += data.toString();
		};

		const onExit = (code: number | null, signal: NodeJS.Signals | null) => {
			finish(() => {
				reject(
					new Error(
						`${label} exited before readiness. code=${code} signal=${signal} stdout=${stdoutBuffer} stderr=${stderrBuffer}`,
					),
				);
			});
		};

		const onError = (error: Error) => {
			finish(() => {
				reject(
					new Error(
						`${label} failed before readiness: ${error.message} stdout=${stdoutBuffer} stderr=${stderrBuffer}`,
					),
				);
			});
		};

		const timeoutId = setTimeout(() => {
			finish(() => {
				reject(
					new Error(
						`${label} failed to become ready within ${PROCESS_TIMEOUT_MS}ms. stdout=${stdoutBuffer} stderr=${stderrBuffer}`,
					),
				);
			});
		}, PROCESS_TIMEOUT_MS);

		processHandle.stdout?.on("data", onStdout);
		processHandle.stderr?.on("data", onStderr);
		processHandle.on("exit", onExit);
		processHandle.on("error", onError);
	});
}

function stopProcess(processHandle: ChildProcess | null): Promise<void> {
	if (!processHandle) {
		return Promise.resolve();
	}

	return new Promise((resolve) => {
		let settled = false;
		const finish = () => {
			if (settled) return;
			settled = true;
			resolve();
		};

		processHandle.once("exit", finish);
		processHandle.kill("SIGTERM");

		setTimeout(() => {
			if (settled) return;
			try {
				processHandle.kill("SIGKILL");
			} catch {
				// Process may already be gone.
			}
			finish();
		}, 2_000);
	});
}

async function waitForCondition(
	check: () => boolean,
	label: string,
	timeoutMs = PROCESS_TIMEOUT_MS,
): Promise<void> {
	const deadline = Date.now() + timeoutMs;
	while (Date.now() < deadline) {
		if (check()) {
			return;
		}

		await new Promise((resolve) => setTimeout(resolve, 100));
	}

	throw new Error(`Timed out waiting for ${label}`);
}

function createMessageQueue(socket: Socket) {
	let buffer = "";
	const queue: Array<IpcResponse | { type: "event"; payload: unknown }> = [];
	const waiters: Array<
		(message: IpcResponse | { type: "event"; payload: unknown }) => void
	> = [];

	const push = (message: IpcResponse | { type: "event"; payload: unknown }) => {
		const waiter = waiters.shift();
		if (waiter) {
			waiter(message);
			return;
		}

		queue.push(message);
	};

	const onData = (data: string) => {
		buffer += data;

		let newlineIndex = buffer.indexOf("\n");
		while (newlineIndex !== -1) {
			const line = buffer.slice(0, newlineIndex);
			buffer = buffer.slice(newlineIndex + 1);

			if (line.trim()) {
				push(
					JSON.parse(line) as IpcResponse | { type: "event"; payload: unknown },
				);
			}

			newlineIndex = buffer.indexOf("\n");
		}
	};

	socket.on("data", onData);

	return {
		nextMessage: () =>
			new Promise<IpcResponse | { type: "event"; payload: unknown }>(
				(resolve, reject) => {
					const queued = queue.shift();
					if (queued) {
						resolve(queued);
						return;
					}

					const timeoutId = setTimeout(() => {
						const index = waiters.indexOf(waiter);
						if (index >= 0) {
							waiters.splice(index, 1);
						}
						reject(new Error("Timed out waiting for socket message"));
					}, MESSAGE_TIMEOUT_MS);

					const waiter = (
						message: IpcResponse | { type: "event"; payload: unknown },
					) => {
						clearTimeout(timeoutId);
						resolve(message);
					};

					waiters.push(waiter);
				},
			),
		nextMessageWithin: (timeoutMs: number) =>
			new Promise<IpcResponse | { type: "event"; payload: unknown } | null>(
				(resolve) => {
					const queued = queue.shift();
					if (queued) {
						resolve(queued);
						return;
					}

					const timeoutId = setTimeout(() => {
						const index = waiters.indexOf(waiter);
						if (index >= 0) {
							waiters.splice(index, 1);
						}
						resolve(null);
					}, timeoutMs);

					const waiter = (
						message: IpcResponse | { type: "event"; payload: unknown },
					) => {
						clearTimeout(timeoutId);
						resolve(message);
					};

					waiters.push(waiter);
				},
			),
		dispose: () => {
			socket.off("data", onData);
		},
	};
}

function sendRequest(socket: Socket, request: IpcRequest): void {
	socket.write(`${JSON.stringify(request)}\n`);
}

const canRunSupervisorIntegration = supportsLocalSocketBinding();

if (!canRunSupervisorIntegration) {
	describe("Terminal Supervisor", () => {
		it("skips when local socket binding is unavailable", () => {
			expect(true).toBe(true);
		});
	});
} else {
	describe("Terminal Supervisor", () => {
		let supervisorProcess: ChildProcess | null = null;

		async function startSupervisorProcess(): Promise<ChildProcess> {
			const processHandle = spawn("bun", ["run", SUPERVISOR_PATH], {
				env: {
					...process.env,
					HOME: TEST_HOME_DIR,
					NODE_ENV: "development",
					SUPERSET_HOME_DIR,
					SUPERSET_WORKSPACE_NAME: "test-supervisor",
				},
				stdio: ["ignore", "pipe", "pipe"],
			});
			await waitForLogLine(
				processHandle,
				"Supervisor started",
				"terminal-supervisor",
			);
			return processHandle;
		}

		beforeAll(async () => {
			killRuntimePids();
			cleanupArtifacts();

			if (!existsSync(SUPERSET_HOME_DIR)) {
				mkdirSync(SUPERSET_HOME_DIR, { recursive: true, mode: 0o700 });
			}

			supervisorProcess = await startSupervisorProcess();
		});

		afterAll(async () => {
			await stopProcess(supervisorProcess);
			supervisorProcess = null;

			killRuntimePids();
			cleanupArtifacts();
		});

		it("proxies create/list/write traffic through the supervisor", async () => {
			const token = readFileSync(SUPERVISOR_TOKEN_PATH, "utf-8").trim();
			const controlSocket = await connectToSocket(SUPERVISOR_SOCKET_PATH);
			const streamSocket = await connectToSocket(SUPERVISOR_SOCKET_PATH);

			const controlQueue = createMessageQueue(controlSocket);
			const streamQueue = createMessageQueue(streamSocket);

			try {
				sendRequest(controlSocket, {
					id: "hello-control",
					type: "hello",
					payload: {
						token,
						protocolVersion: PROTOCOL_VERSION,
						clientId: "test-client",
						role: "control",
					},
				});
				const controlHello = (await controlQueue.nextMessage()) as IpcResponse;
				expect(controlHello.ok).toBe(true);
				expect(
					(controlHello as { ok: true; payload: HelloResponse }).payload,
				).toMatchObject({
					protocolVersion: PROTOCOL_VERSION,
					daemonPid: expect.any(Number),
				});

				sendRequest(streamSocket, {
					id: "hello-stream",
					type: "hello",
					payload: {
						token,
						protocolVersion: PROTOCOL_VERSION,
						clientId: "test-client",
						role: "stream",
					},
				});
				const streamHello = (await streamQueue.nextMessage()) as IpcResponse;
				expect(streamHello.ok).toBe(true);

				sendRequest(controlSocket, {
					id: "list-1",
					type: "listSessions",
					payload: undefined,
				});
				const initialList = (await controlQueue.nextMessage()) as IpcResponse;
				expect(initialList.ok).toBe(true);
				expect(
					(
						initialList as {
							ok: true;
							payload: { sessions: Array<{ sessionId: string }> };
						}
					).payload.sessions,
				).toEqual([]);

				sendRequest(controlSocket, {
					id: "create-1",
					type: "createOrAttach",
					payload: {
						sessionId: "supervisor-test-session",
						cols: 80,
						rows: 24,
						cwd: TEST_HOME_DIR,
						workspaceId: "workspace-1",
						paneId: "pane-1",
						tabId: "tab-1",
					},
				});
				const createResponse =
					(await controlQueue.nextMessage()) as IpcResponse;
				expect(createResponse.ok).toBe(true);
				expect(
					(
						createResponse as {
							ok: true;
							payload: { isNew: boolean; snapshot: { cols: number } };
						}
					).payload,
				).toMatchObject({
					isNew: true,
					snapshot: { cols: 80 },
				});

				sendRequest(controlSocket, {
					id: "kill-1",
					type: "kill",
					payload: {
						sessionId: "supervisor-test-session",
					},
				});
				const killResponse = (await controlQueue.nextMessage()) as IpcResponse;
				expect(killResponse.ok).toBe(true);

				let sawExitEvent = false;
				const deadline = Date.now() + MESSAGE_TIMEOUT_MS;
				while (!sawExitEvent && Date.now() < deadline) {
					const message = await streamQueue.nextMessage();
					if (
						"type" in message &&
						message.type === "event" &&
						typeof message.payload === "object" &&
						message.payload !== null &&
						"type" in message.payload &&
						message.payload.type === "exit"
					) {
						sawExitEvent = true;
					}
				}
				expect(sawExitEvent).toBe(true);

				sendRequest(controlSocket, {
					id: "list-2",
					type: "listSessions",
					payload: undefined,
				});
				const populatedList = (await controlQueue.nextMessage()) as IpcResponse;
				expect(populatedList.ok).toBe(true);
				expect(
					(
						populatedList as {
							ok: true;
							payload: {
								sessions: Array<{ sessionId: string; isAlive: boolean }>;
							};
						}
					).payload.sessions,
				).toContainEqual(
					expect.objectContaining({
						sessionId: "supervisor-test-session",
						isAlive: false,
					}),
				);
			} finally {
				controlQueue.dispose();
				streamQueue.dispose();
				controlSocket.destroy();
				streamSocket.destroy();
			}
		}, 30_000);

		it("routes events only to attached clients and keeps worker attachment until the last detach", async () => {
			const token = readFileSync(SUPERVISOR_TOKEN_PATH, "utf-8").trim();
			const clientAControl = await connectToSocket(SUPERVISOR_SOCKET_PATH);
			const clientAStream = await connectToSocket(SUPERVISOR_SOCKET_PATH);
			const clientBControl = await connectToSocket(SUPERVISOR_SOCKET_PATH);
			const clientBStream = await connectToSocket(SUPERVISOR_SOCKET_PATH);

			const clientAControlQueue = createMessageQueue(clientAControl);
			const clientAStreamQueue = createMessageQueue(clientAStream);
			const clientBControlQueue = createMessageQueue(clientBControl);
			const clientBStreamQueue = createMessageQueue(clientBStream);

			try {
				for (const [socket, queue, clientId, role] of [
					[clientAControl, clientAControlQueue, "client-a", "control"] as const,
					[clientAStream, clientAStreamQueue, "client-a", "stream"] as const,
					[clientBControl, clientBControlQueue, "client-b", "control"] as const,
					[clientBStream, clientBStreamQueue, "client-b", "stream"] as const,
				]) {
					sendRequest(socket, {
						id: `hello-${clientId}-${role}`,
						type: "hello",
						payload: {
							token,
							protocolVersion: PROTOCOL_VERSION,
							clientId,
							role,
						},
					});
					const response = (await queue.nextMessage()) as IpcResponse;
					expect(response.ok).toBe(true);
				}

				const sharedSessionRequest = {
					sessionId: "shared-session",
					cols: 80,
					rows: 24,
					cwd: TEST_HOME_DIR,
					workspaceId: "workspace-shared",
					paneId: "pane-shared",
					tabId: "tab-shared",
				};

				sendRequest(clientAControl, {
					id: "create-shared-a",
					type: "createOrAttach",
					payload: sharedSessionRequest,
				});
				expect(
					((await clientAControlQueue.nextMessage()) as IpcResponse).ok,
				).toBe(true);

				sendRequest(clientBControl, {
					id: "create-shared-b",
					type: "createOrAttach",
					payload: sharedSessionRequest,
				});
				expect(
					((await clientBControlQueue.nextMessage()) as IpcResponse).ok,
				).toBe(true);

				sendRequest(clientAControl, {
					id: "list-shared-2",
					type: "listSessions",
					payload: undefined,
				});
				const attachedList = (await clientAControlQueue.nextMessage()) as {
					ok: true;
					payload: {
						sessions: Array<{ sessionId: string; attachedClients: number }>;
					};
				};
				expect(attachedList.payload.sessions).toContainEqual(
					expect.objectContaining({
						sessionId: "shared-session",
						attachedClients: 2,
					}),
				);

				sendRequest(clientAControl, {
					id: "detach-shared-a",
					type: "detach",
					payload: { sessionId: "shared-session" },
				});
				expect(
					((await clientAControlQueue.nextMessage()) as IpcResponse).ok,
				).toBe(true);

				sendRequest(clientBControl, {
					id: "list-shared-1",
					type: "listSessions",
					payload: undefined,
				});
				const detachedList = (await clientBControlQueue.nextMessage()) as {
					ok: true;
					payload: {
						sessions: Array<{ sessionId: string; attachedClients: number }>;
					};
				};
				expect(detachedList.payload.sessions).toContainEqual(
					expect.objectContaining({
						sessionId: "shared-session",
						attachedClients: 1,
					}),
				);

				sendRequest(clientBControl, {
					id: "kill-shared",
					type: "kill",
					payload: { sessionId: "shared-session" },
				});
				expect(
					((await clientBControlQueue.nextMessage()) as IpcResponse).ok,
				).toBe(true);

				let clientBSawExit = false;
				const deadline = Date.now() + MESSAGE_TIMEOUT_MS;
				while (!clientBSawExit && Date.now() < deadline) {
					const message = await clientBStreamQueue.nextMessage();
					if (
						"type" in message &&
						message.type === "event" &&
						typeof message.payload === "object" &&
						message.payload !== null &&
						"type" in message.payload &&
						message.payload.type === "exit"
					) {
						clientBSawExit = true;
					}
				}
				expect(clientBSawExit).toBe(true);

				const clientAUnexpectedMessage =
					await clientAStreamQueue.nextMessageWithin(500);
				expect(clientAUnexpectedMessage).toBeNull();
			} finally {
				clientAControlQueue.dispose();
				clientAStreamQueue.dispose();
				clientBControlQueue.dispose();
				clientBStreamQueue.dispose();
				clientAControl.destroy();
				clientAStream.destroy();
				clientBControl.destroy();
				clientBStream.destroy();
			}
		}, 30_000);

		it("keeps existing sessions on the old generation while new sessions move to the preferred worker", async () => {
			const token = readFileSync(SUPERVISOR_TOKEN_PATH, "utf-8").trim();
			const genASocketPath = getWorkerSocketPath("gen-a");
			const genBSocketPath = getWorkerSocketPath("gen-b");
			const clientAControl = await connectToSocket(SUPERVISOR_SOCKET_PATH);
			const clientAStream = await connectToSocket(SUPERVISOR_SOCKET_PATH);
			const clientBControl = await connectToSocket(SUPERVISOR_SOCKET_PATH);
			const clientBStream = await connectToSocket(SUPERVISOR_SOCKET_PATH);

			const clientAControlQueue = createMessageQueue(clientAControl);
			const clientAStreamQueue = createMessageQueue(clientAStream);
			const clientBControlQueue = createMessageQueue(clientBControl);
			const clientBStreamQueue = createMessageQueue(clientBStream);

			try {
				for (const [socket, queue, clientId, role, generation] of [
					[
						clientAControl,
						clientAControlQueue,
						"rollout-client-a",
						"control",
						"gen-a",
					] as const,
					[
						clientAStream,
						clientAStreamQueue,
						"rollout-client-a",
						"stream",
						"gen-a",
					] as const,
				]) {
					sendRequest(socket, {
						id: `hello-${clientId}-${role}`,
						type: "hello",
						payload: {
							token,
							protocolVersion: PROTOCOL_VERSION,
							clientId,
							role,
							preferredWorkerGeneration: generation,
						},
					});
					const response = (await queue.nextMessage()) as {
						ok: true;
						payload: HelloResponse;
					};
					expect(response.ok).toBe(true);
					expect(response.payload.preferredWorkerGeneration).toBe("gen-a");
				}

				sendRequest(clientAControl, {
					id: "create-old-session",
					type: "createOrAttach",
					payload: {
						sessionId: "rollout-old-session",
						cols: 80,
						rows: 24,
						cwd: TEST_HOME_DIR,
						workspaceId: "workspace-rollout",
						paneId: "pane-old",
						tabId: "tab-old",
					},
				});
				const oldSessionResponse =
					(await clientAControlQueue.nextMessage()) as {
						ok: true;
						payload: {
							workerGeneration?: string;
						};
					};
				expect(oldSessionResponse.ok).toBe(true);
				expect(oldSessionResponse.payload.workerGeneration).toBe("gen-a");
				expect(existsSync(genASocketPath)).toBe(true);

				for (const [socket, queue, clientId, role, generation] of [
					[
						clientBControl,
						clientBControlQueue,
						"rollout-client-b",
						"control",
						"gen-b",
					] as const,
					[
						clientBStream,
						clientBStreamQueue,
						"rollout-client-b",
						"stream",
						"gen-b",
					] as const,
				]) {
					sendRequest(socket, {
						id: `hello-${clientId}-${role}`,
						type: "hello",
						payload: {
							token,
							protocolVersion: PROTOCOL_VERSION,
							clientId,
							role,
							preferredWorkerGeneration: generation,
						},
					});
					const response = (await queue.nextMessage()) as {
						ok: true;
						payload: HelloResponse;
					};
					expect(response.ok).toBe(true);
					expect(response.payload.preferredWorkerGeneration).toBe("gen-b");
				}
				await waitForCondition(
					() => existsSync(genBSocketPath),
					"gen-b worker socket to exist",
				);

				sendRequest(clientBControl, {
					id: "create-new-session",
					type: "createOrAttach",
					payload: {
						sessionId: "rollout-new-session",
						cols: 80,
						rows: 24,
						cwd: TEST_HOME_DIR,
						workspaceId: "workspace-rollout",
						paneId: "pane-new",
						tabId: "tab-new",
					},
				});
				const newSessionResponse =
					(await clientBControlQueue.nextMessage()) as {
						ok: true;
						payload: {
							workerGeneration?: string;
						};
					};
				expect(newSessionResponse.ok).toBe(true);
				expect(newSessionResponse.payload.workerGeneration).toBe("gen-b");

				sendRequest(clientBControl, {
					id: "list-rollout-sessions",
					type: "listSessions",
					payload: undefined,
				});
				const listResponse = (await clientBControlQueue.nextMessage()) as {
					ok: true;
					payload: {
						sessions: Array<{
							sessionId: string;
							workerGeneration?: string;
						}>;
					};
				};
				expect(listResponse.ok).toBe(true);
				expect(listResponse.payload.sessions).toEqual(
					expect.arrayContaining([
						expect.objectContaining({
							sessionId: "rollout-old-session",
							workerGeneration: "gen-a",
						}),
						expect.objectContaining({
							sessionId: "rollout-new-session",
							workerGeneration: "gen-b",
						}),
					]),
				);

				sendRequest(clientAControl, {
					id: "kill-old-session",
					type: "kill",
					payload: {
						sessionId: "rollout-old-session",
					},
				});
				expect(
					((await clientAControlQueue.nextMessage()) as IpcResponse).ok,
				).toBe(true);

				let clientASawExit = false;
				const deadline = Date.now() + MESSAGE_TIMEOUT_MS;
				while (!clientASawExit && Date.now() < deadline) {
					const message = await clientAStreamQueue.nextMessage();
					if (
						"type" in message &&
						message.type === "event" &&
						typeof message.payload === "object" &&
						message.payload !== null &&
						"type" in message.payload &&
						message.payload.type === "exit"
					) {
						clientASawExit = true;
					}
				}
				expect(clientASawExit).toBe(true);

				sendRequest(clientAControl, {
					id: "detach-old-session",
					type: "detach",
					payload: { sessionId: "rollout-old-session" },
				});
				expect(
					((await clientAControlQueue.nextMessage()) as IpcResponse).ok,
				).toBe(true);

				await waitForCondition(
					() => !existsSync(genASocketPath),
					"gen-a worker socket to be retired",
				);
				expect(existsSync(genBSocketPath)).toBe(true);
			} finally {
				clientAControlQueue.dispose();
				clientAStreamQueue.dispose();
				clientBControlQueue.dispose();
				clientBStreamQueue.dispose();
				clientAControl.destroy();
				clientAStream.destroy();
				clientBControl.destroy();
				clientBStream.destroy();
			}
		}, 30_000);

		it("recovers detached worker sessions after the supervisor restarts", async () => {
			const initialToken = readFileSync(SUPERVISOR_TOKEN_PATH, "utf-8").trim();
			const workerSocketPath = getWorkerSocketPath("recover-a");
			const initialControl = await connectToSocket(SUPERVISOR_SOCKET_PATH);
			const initialStream = await connectToSocket(SUPERVISOR_SOCKET_PATH);

			const initialControlQueue = createMessageQueue(initialControl);
			const initialStreamQueue = createMessageQueue(initialStream);

			try {
				for (const [socket, queue, role] of [
					[initialControl, initialControlQueue, "control"] as const,
					[initialStream, initialStreamQueue, "stream"] as const,
				]) {
					sendRequest(socket, {
						id: `hello-recovery-initial-${role}`,
						type: "hello",
						payload: {
							token: initialToken,
							protocolVersion: PROTOCOL_VERSION,
							clientId: "recovery-initial",
							role,
							preferredWorkerGeneration: "recover-a",
						},
					});
					const response = (await queue.nextMessage()) as {
						ok: true;
						payload: HelloResponse;
					};
					expect(response.ok).toBe(true);
					expect(response.payload.preferredWorkerGeneration).toBe("recover-a");
				}

				sendRequest(initialControl, {
					id: "create-recovery-session",
					type: "createOrAttach",
					payload: {
						sessionId: "recovery-session",
						cols: 80,
						rows: 24,
						cwd: TEST_HOME_DIR,
						workspaceId: "workspace-recovery",
						paneId: "pane-recovery",
						tabId: "tab-recovery",
					},
				});
				const createResponse = (await initialControlQueue.nextMessage()) as {
					ok: true;
					payload: {
						workerGeneration?: string;
					};
				};
				expect(createResponse.ok).toBe(true);
				expect(createResponse.payload.workerGeneration).toBe("recover-a");
				await waitForCondition(
					() => existsSync(workerSocketPath),
					"recovery worker socket to exist",
				);

				sendRequest(initialControl, {
					id: "detach-recovery-session",
					type: "detach",
					payload: { sessionId: "recovery-session" },
				});
				expect(
					((await initialControlQueue.nextMessage()) as IpcResponse).ok,
				).toBe(true);
			} finally {
				initialControlQueue.dispose();
				initialStreamQueue.dispose();
				initialControl.destroy();
				initialStream.destroy();
			}

			await stopProcess(supervisorProcess);
			supervisorProcess = await startSupervisorProcess();

			const restartedToken = readFileSync(
				SUPERVISOR_TOKEN_PATH,
				"utf-8",
			).trim();
			const restartedControl = await connectToSocket(SUPERVISOR_SOCKET_PATH);
			const restartedStream = await connectToSocket(SUPERVISOR_SOCKET_PATH);
			const restartedControlQueue = createMessageQueue(restartedControl);
			const restartedStreamQueue = createMessageQueue(restartedStream);

			try {
				for (const [socket, queue, role] of [
					[restartedControl, restartedControlQueue, "control"] as const,
					[restartedStream, restartedStreamQueue, "stream"] as const,
				]) {
					sendRequest(socket, {
						id: `hello-recovery-restarted-${role}`,
						type: "hello",
						payload: {
							token: restartedToken,
							protocolVersion: PROTOCOL_VERSION,
							clientId: "recovery-restarted",
							role,
							preferredWorkerGeneration: "recover-b",
						},
					});
					const response = (await queue.nextMessage()) as {
						ok: true;
						payload: HelloResponse;
					};
					expect(response.ok).toBe(true);
					expect(response.payload.preferredWorkerGeneration).toBe("recover-b");
				}

				sendRequest(restartedControl, {
					id: "list-recovered-sessions",
					type: "listSessions",
					payload: undefined,
				});
				const listResponse = (await restartedControlQueue.nextMessage()) as {
					ok: true;
					payload: {
						sessions: Array<{
							sessionId: string;
							attachedClients: number;
							workerGeneration?: string;
						}>;
					};
				};
				expect(listResponse.ok).toBe(true);
				expect(listResponse.payload.sessions).toContainEqual(
					expect.objectContaining({
						sessionId: "recovery-session",
						attachedClients: 0,
						workerGeneration: "recover-a",
					}),
				);

				sendRequest(restartedControl, {
					id: "reattach-recovery-session",
					type: "createOrAttach",
					payload: {
						sessionId: "recovery-session",
						cols: 80,
						rows: 24,
						cwd: TEST_HOME_DIR,
						workspaceId: "workspace-recovery",
						paneId: "pane-recovery",
						tabId: "tab-recovery",
					},
				});
				const reattachResponse =
					(await restartedControlQueue.nextMessage()) as {
						ok: true;
						payload: {
							isNew: boolean;
							workerGeneration?: string;
						};
					};
				expect(reattachResponse.ok).toBe(true);
				expect(reattachResponse.payload.isNew).toBe(false);
				expect(reattachResponse.payload.workerGeneration).toBe("recover-a");

				sendRequest(restartedControl, {
					id: "kill-recovery-session",
					type: "kill",
					payload: { sessionId: "recovery-session" },
				});
				expect(
					((await restartedControlQueue.nextMessage()) as IpcResponse).ok,
				).toBe(true);
			} finally {
				restartedControlQueue.dispose();
				restartedStreamQueue.dispose();
				restartedControl.destroy();
				restartedStream.destroy();
			}
		}, 30_000);
	});
}
