import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import type { ChildProcess } from "node:child_process";
import { spawn } from "node:child_process";
import {
	existsSync,
	mkdirSync,
	mkdtempSync,
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
const SUPERVISOR_PID_PATH = join(SUPERSET_HOME_DIR, "terminal-supervisor.pid");
const WORKER_SOCKET_PATH = join(SUPERSET_HOME_DIR, "terminal-host.sock");
const WORKER_TOKEN_PATH = join(SUPERSET_HOME_DIR, "terminal-host.token");
const WORKER_PID_PATH = join(SUPERSET_HOME_DIR, "terminal-host.pid");

const SUPERVISOR_PATH = resolve(__dirname, "index.ts");
const WORKER_PATH = resolve(__dirname, "../terminal-host/index.ts");
const XTERM_POLYFILL_PATH = resolve(
	__dirname,
	"../terminal-host/xterm-env-polyfill.ts",
);

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
	for (const path of [
		SUPERVISOR_SOCKET_PATH,
		SUPERVISOR_TOKEN_PATH,
		SUPERVISOR_PID_PATH,
		WORKER_SOCKET_PATH,
		WORKER_TOKEN_PATH,
		WORKER_PID_PATH,
	]) {
		cleanupPath(path);
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
		let workerProcess: ChildProcess | null = null;
		let supervisorProcess: ChildProcess | null = null;

		beforeAll(async () => {
			cleanupArtifacts();

			if (!existsSync(SUPERSET_HOME_DIR)) {
				mkdirSync(SUPERSET_HOME_DIR, { recursive: true, mode: 0o700 });
			}

			workerProcess = spawn(
				"bun",
				["run", "--preload", XTERM_POLYFILL_PATH, WORKER_PATH],
				{
					env: {
						...process.env,
						HOME: TEST_HOME_DIR,
						NODE_ENV: "development",
						SUPERSET_HOME_DIR,
						SUPERSET_WORKSPACE_NAME: "test-supervisor",
					},
					stdio: ["ignore", "pipe", "pipe"],
				},
			);
			await waitForLogLine(workerProcess, "Daemon started", "terminal-host");

			supervisorProcess = spawn("bun", ["run", SUPERVISOR_PATH], {
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
				supervisorProcess,
				"Supervisor started",
				"terminal-supervisor",
			);
		});

		afterAll(async () => {
			await stopProcess(supervisorProcess);
			supervisorProcess = null;

			await stopProcess(workerProcess);
			workerProcess = null;

			killPidFile(SUPERVISOR_PID_PATH);
			killPidFile(WORKER_PID_PATH);
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
	});
}
