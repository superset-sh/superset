/**
 * Terminal Host Session Lifecycle Integration Tests
 *
 * Tests the full session lifecycle:
 * 1. Create session with PTY
 * 2. Write data to terminal
 * 3. Receive output events
 * 4. Resize terminal
 * 5. List sessions
 * 6. Kill session
 */

import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import type { ChildProcess } from "node:child_process";
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { connect, type Socket } from "node:net";
import { resolve } from "node:path";
import {
	type CreateOrAttachRequest,
	type CreateOrAttachResponse,
	type IpcEvent,
	type IpcRequest,
	type IpcResponse,
	type ListSessionsResponse,
	PROTOCOL_VERSION,
	type TerminalDataEvent,
} from "../lib/terminal-host/types";
import { TERMINAL_HOST_PATHS } from "../lib/terminal-host/paths";

const {
	IS_WINDOWS,
	SUPERSET_HOME_DIR,
	SOCKET_PATH,
	TOKEN_PATH,
	PID_PATH,
} = TERMINAL_HOST_PATHS;

// Path to the daemon source file
const DAEMON_PATH = resolve(__dirname, "index.ts");

// Timeouts
const DAEMON_TIMEOUT = 10000;
const CONNECT_TIMEOUT = 5000;

describe("Terminal Host Session Lifecycle", () => {
	let daemonProcess: ChildProcess | null = null;

	/**
	 * Clean up any existing daemon artifacts
	 */
	function cleanup() {
		if (existsSync(PID_PATH)) {
			try {
				const pid = Number.parseInt(readFileSync(PID_PATH, "utf-8").trim(), 10);
				if (pid > 0) {
					process.kill(pid, "SIGTERM");
				}
			} catch {
				// Process might not exist
			}
		}

		if (!IS_WINDOWS && existsSync(SOCKET_PATH)) {
			try {
				rmSync(SOCKET_PATH);
			} catch {
				// Ignore
			}
		}

		if (existsSync(PID_PATH)) {
			try {
				rmSync(PID_PATH);
			} catch {
				// Ignore
			}
		}

		if (existsSync(TOKEN_PATH)) {
			try {
				rmSync(TOKEN_PATH);
			} catch {
				// Ignore
			}
		}
	}

	/**
	 * Start the daemon process
	 */
	async function startDaemon(): Promise<void> {
		return new Promise((resolve, reject) => {
			if (!existsSync(SUPERSET_HOME_DIR)) {
				mkdirSync(SUPERSET_HOME_DIR, { recursive: true, mode: 0o700 });
			}

			daemonProcess = spawn("bun", ["run", DAEMON_PATH], {
				env: {
					...process.env,
					NODE_ENV: "development",
				},
				stdio: ["ignore", "pipe", "pipe"],
				detached: true,
			});

			let output = "";
			let settled = false;
			let timeoutId: ReturnType<typeof setTimeout>;

			daemonProcess.stdout?.on("data", (data) => {
				output += data.toString();
				if (output.includes("Daemon started")) {
					if (settled) return;
					settled = true;
					clearTimeout(timeoutId);
					resolve();
				}
			});

			daemonProcess.stderr?.on("data", (data) => {
				console.error("Daemon stderr:", data.toString());
			});

			daemonProcess.on("error", (error) => {
				if (settled) return;
				settled = true;
				clearTimeout(timeoutId);
				reject(new Error(`Failed to start daemon: ${error.message}`));
			});

			daemonProcess.on("exit", (code, signal) => {
				if (!settled && code !== 0 && code !== null) {
					settled = true;
					clearTimeout(timeoutId);
					reject(
						new Error(`Daemon exited with code ${code}, signal ${signal}`),
					);
				}
			});

			timeoutId = setTimeout(() => {
				if (settled) return;
				settled = true;
				reject(
					new Error(
						`Daemon failed to start within ${DAEMON_TIMEOUT}ms. Output: ${output}`,
					),
				);
			}, DAEMON_TIMEOUT);
		});
	}

	/**
	 * Stop the daemon process
	 */
	async function stopDaemon(): Promise<void> {
		if (daemonProcess) {
			return new Promise((resolve) => {
				daemonProcess?.on("exit", () => {
					daemonProcess = null;
					resolve();
				});

				daemonProcess?.kill("SIGTERM");

				setTimeout(() => {
					if (daemonProcess) {
						daemonProcess.kill("SIGKILL");
						daemonProcess = null;
						resolve();
					}
				}, 2000);
			});
		}
	}

	/**
	 * Connect to the daemon socket
	 */
	function connectToDaemon(): Promise<Socket> {
		return new Promise((resolve, reject) => {
			const socket = connect(SOCKET_PATH);

			socket.on("connect", () => {
				resolve(socket);
			});

			socket.on("error", (error) => {
				reject(new Error(`Failed to connect to daemon: ${error.message}`));
			});

			setTimeout(() => {
				reject(new Error(`Connection timed out after ${CONNECT_TIMEOUT}ms`));
			}, CONNECT_TIMEOUT);
		});
	}

	/**
	 * Send a request and wait for response
	 */
	function sendRequest(
		socket: Socket,
		request: IpcRequest,
	): Promise<IpcResponse> {
		return new Promise((resolve, reject) => {
			let buffer = "";
			let timeoutId: ReturnType<typeof setTimeout>;

			const onData = (data: Buffer) => {
				buffer += data.toString();
				const newlineIndex = buffer.indexOf("\n");
				if (newlineIndex !== -1) {
					const line = buffer.slice(0, newlineIndex);
					buffer = buffer.slice(newlineIndex + 1);
					socket.off("data", onData);
					clearTimeout(timeoutId);
					try {
						resolve(JSON.parse(line));
					} catch (_error) {
						reject(new Error(`Failed to parse response: ${line}`));
					}
				}
			};

			socket.on("data", onData);
			socket.write(`${JSON.stringify(request)}\n`);

			timeoutId = setTimeout(() => {
				socket.off("data", onData);
				reject(new Error("Request timed out"));
			}, 5000);
		});
	}

	/**
	 * Wait for a session to be ready (alive and accepting requests)
	 */
	async function waitForSessionReady(
		socket: Socket,
		sessionId: string,
		timeoutMs = 5000,
	): Promise<boolean> {
		const startTime = Date.now();
		while (Date.now() - startTime < timeoutMs) {
			const listRequest: IpcRequest = {
				id: `list-${Date.now()}`,
				type: "listSessions",
				payload: undefined,
			};
			const response = await sendRequest(socket, listRequest);
			if (response.ok) {
				const payload = response.payload as ListSessionsResponse;
				const session = payload.sessions.find((s) => s.sessionId === sessionId);
				if (session?.isAlive) {
					return true;
				}
			}
			await new Promise((r) => setTimeout(r, 100));
		}
		return false;
	}

	/**
	 * Authenticate with the daemon
	 */
	async function authenticate({
		socket,
		clientId,
		role,
	}: {
		socket: Socket;
		clientId: string;
		role: "control" | "stream";
	}): Promise<void> {
		const token = readFileSync(TOKEN_PATH, "utf-8").trim();

		const request: IpcRequest = {
			id: `auth-${Date.now()}`,
			type: "hello",
			payload: {
				token,
				protocolVersion: PROTOCOL_VERSION,
				clientId,
				role,
			},
		};

		const response = await sendRequest(socket, request);
		if (!response.ok) {
			throw new Error(`Authentication failed: ${JSON.stringify(response)}`);
		}
	}

	async function connectClient(): Promise<{
		control: Socket;
		stream: Socket;
		clientId: string;
	}> {
		const control = await connectToDaemon();
		const stream = await connectToDaemon();
		const clientId = `test-client-${Date.now()}-${Math.random().toString(16).slice(2)}`;
		await authenticate({ socket: control, clientId, role: "control" });
		await authenticate({ socket: stream, clientId, role: "stream" });
		return { control, stream, clientId };
	}

	/**
	 * Wait for events from the socket
	 */
	function waitForEvent(
		socket: Socket,
		eventType: string,
		timeout = 5000,
	): Promise<IpcEvent> {
		return new Promise((resolve, reject) => {
			let buffer = "";

			const onData = (data: Buffer) => {
				buffer += data.toString();
				let newlineIndex = buffer.indexOf("\n");
				while (newlineIndex !== -1) {
					const line = buffer.slice(0, newlineIndex);
					buffer = buffer.slice(newlineIndex + 1);

					try {
						const message = JSON.parse(line);
						if (message.type === "event" && message.event === eventType) {
							socket.off("data", onData);
							resolve(message);
							return;
						}
					} catch {
						// Ignore parse errors
					}

					newlineIndex = buffer.indexOf("\n");
				}
			};

			socket.on("data", onData);

			setTimeout(() => {
				socket.off("data", onData);
				reject(new Error(`Event '${eventType}' timed out after ${timeout}ms`));
			}, timeout);
		});
	}

	beforeAll(async () => {
		cleanup();
		await startDaemon();
	});

	afterAll(async () => {
		await stopDaemon();
		cleanup();
	});

	describe("session creation", () => {
		it("should create a new session and return snapshot", async () => {
			const { control, stream } = await connectClient();

			try {
				const createRequest: IpcRequest = {
					id: "test-create-1",
					type: "createOrAttach",
					payload: {
						sessionId: "test-session-1",
						workspaceId: "workspace-1",
						paneId: "pane-1",
						tabId: "tab-1",
						cols: 80,
						rows: 24,
						cwd: process.env.HOME,
					} satisfies CreateOrAttachRequest,
				};

				const response = await sendRequest(control, createRequest);

				expect(response.id).toBe("test-create-1");
				expect(response.ok).toBe(true);

				if (response.ok) {
					const payload = response.payload as CreateOrAttachResponse;
					expect(payload.isNew).toBe(true);
					expect(payload.snapshot).toBeDefined();
					expect(payload.snapshot.cols).toBe(80);
					expect(payload.snapshot.rows).toBe(24);
				}
			} finally {
				control.destroy();
				stream.destroy();
			}
		});

		// Note: PTY operations may fail in CI environment due to bun/node-pty compatibility
		it.skip("should attach to existing session", async () => {
			const { control, stream } = await connectClient();

			try {
				// Create first session
				const createRequest1: IpcRequest = {
					id: "test-create-2a",
					type: "createOrAttach",
					payload: {
						sessionId: "test-session-2",
						workspaceId: "workspace-1",
						paneId: "pane-2",
						tabId: "tab-1",
						cols: 80,
						rows: 24,
						cwd: process.env.HOME,
					} satisfies CreateOrAttachRequest,
				};

				const response1 = await sendRequest(control, createRequest1);
				expect(response1.ok).toBe(true);
				if (response1.ok) {
					expect((response1.payload as CreateOrAttachResponse).isNew).toBe(
						true,
					);
				}

				// Wait for the session to be fully ready before attaching
				// PTY spawn can be async and session needs to be alive for attach
				const isReady = await waitForSessionReady(control, "test-session-2");
				expect(isReady).toBe(true);

				// Attach to same session
				const createRequest2: IpcRequest = {
					id: "test-create-2b",
					type: "createOrAttach",
					payload: {
						sessionId: "test-session-2",
						workspaceId: "workspace-1",
						paneId: "pane-2",
						tabId: "tab-1",
						cols: 80,
						rows: 24,
						cwd: process.env.HOME,
					} satisfies CreateOrAttachRequest,
				};

				const response2 = await sendRequest(control, createRequest2);
				if (!response2.ok) {
					// Log error details for debugging
					console.error("Attach failed:", JSON.stringify(response2, null, 2));
				}
				expect(response2.ok).toBe(true);
				if (response2.ok) {
					const payload = response2.payload as CreateOrAttachResponse;
					expect(payload.isNew).toBe(false);
					expect(payload.wasRecovered).toBe(true);
				}
			} finally {
				control.destroy();
				stream.destroy();
			}
		});
	});

	describe("backpressure isolation", () => {
		// Note: PTY operations may fail in CI environment due to bun/node-pty compatibility
		it.skip("should not delay createOrAttach when stream socket is backpressured", async () => {
			const { control, stream } = await connectClient();

			try {
				// Stop consuming the stream to simulate a slow/unresponsive client.
				stream.pause();

				// Force the daemon to write a *large* event to the stream socket without relying on PTY output.
				// We do this by sending a notify write to a non-existent session with an intentionally huge ID,
				// which triggers an error event written to the stream socket.
				const hugeSessionId = `bp-missing-${"x".repeat(50_000)}`;
				control.write(
					`${JSON.stringify({
						id: "notify_bp_1",
						type: "write",
						payload: { sessionId: hugeSessionId, data: "x" },
					})}\n`,
				);

				// Give the daemon a moment to enqueue the error event and hit backpressure.
				await new Promise((resolve) => setTimeout(resolve, 50));

				// Create/attach should still complete quickly because it returns over the control socket.
				const startTime = Date.now();
				const createRequest2: IpcRequest = {
					id: "bp-create-2",
					type: "createOrAttach",
					payload: {
						sessionId: "bp-session-2",
						workspaceId: "workspace-1",
						paneId: "bp-pane-2",
						tabId: "tab-1",
						cols: 80,
						rows: 24,
						cwd: process.env.HOME,
					} satisfies CreateOrAttachRequest,
				};

				const createResponse2 = await sendRequest(control, createRequest2);
				const elapsedMs = Date.now() - startTime;

				expect(createResponse2.ok).toBe(true);
				expect(elapsedMs).toBeLessThan(3000);

				// Cleanup (best-effort)
				await sendRequest(control, {
					id: "bp-kill-2",
					type: "kill",
					payload: { sessionId: "bp-session-2" },
				});
			} finally {
				control.destroy();
				stream.destroy();
			}
		});
	});

	describe("session operations", () => {
		// Note: PTY operations may fail in test environment due to bun/node-pty compatibility
		// The daemon infrastructure is tested separately in daemon.test.ts
		it.skip("should write data to terminal and receive output", async () => {
			const { control, stream } = await connectClient();

			try {
				// Create session
				const createRequest: IpcRequest = {
					id: "test-write-1",
					type: "createOrAttach",
					payload: {
						sessionId: "test-session-write",
						workspaceId: "workspace-1",
						paneId: "pane-write",
						tabId: "tab-1",
						cols: 80,
						rows: 24,
						cwd: process.env.HOME,
					} satisfies CreateOrAttachRequest,
				};

				await sendRequest(control, createRequest);

				// Wait for shell prompt (data event)
				const dataPromise = waitForEvent(stream, "data", 10000);

				// Write a simple echo command
				const writeRequest: IpcRequest = {
					id: "test-write-2",
					type: "write",
					payload: {
						sessionId: "test-session-write",
						data: "echo hello\n",
					},
				};

				const writeResponse = await sendRequest(control, writeRequest);
				if (!writeResponse.ok) {
					console.error("Write failed:", writeResponse);
				}
				expect(writeResponse.ok).toBe(true);

				// Wait for output
				const event = await dataPromise;
				expect(event.sessionId).toBe("test-session-write");
				expect(event.event).toBe("data");

				const payload = event.payload as TerminalDataEvent;
				expect(payload.type).toBe("data");
				expect(typeof payload.data).toBe("string");
			} finally {
				control.destroy();
				stream.destroy();
			}
		});

		// Note: PTY operations may fail in test environment due to bun/node-pty compatibility
		it.skip("should resize terminal", async () => {
			const { control, stream } = await connectClient();

			try {
				// Create session
				const createRequest: IpcRequest = {
					id: "test-resize-1",
					type: "createOrAttach",
					payload: {
						sessionId: "test-session-resize",
						workspaceId: "workspace-1",
						paneId: "pane-resize",
						tabId: "tab-1",
						cols: 80,
						rows: 24,
						cwd: process.env.HOME,
					} satisfies CreateOrAttachRequest,
				};

				await sendRequest(control, createRequest);

				// Resize
				const resizeRequest: IpcRequest = {
					id: "test-resize-2",
					type: "resize",
					payload: {
						sessionId: "test-session-resize",
						cols: 120,
						rows: 40,
					},
				};

				const resizeResponse = await sendRequest(control, resizeRequest);
				expect(resizeResponse.ok).toBe(true);
			} finally {
				control.destroy();
				stream.destroy();
			}
		});
	});

	describe("session listing", () => {
		// Note: PTY operations may fail in test environment due to bun/node-pty compatibility
		it.skip("should list all sessions", async () => {
			const { control, stream } = await connectClient();

			try {
				// Create two sessions
				for (const id of ["session-list-1", "session-list-2"]) {
					const createRequest: IpcRequest = {
						id: `create-${id}`,
						type: "createOrAttach",
						payload: {
							sessionId: id,
							workspaceId: "workspace-1",
							paneId: `pane-${id}`,
							tabId: "tab-1",
							cols: 80,
							rows: 24,
							cwd: process.env.HOME,
						} satisfies CreateOrAttachRequest,
					};
					await sendRequest(control, createRequest);
				}

				// List sessions
				const listRequest: IpcRequest = {
					id: "test-list",
					type: "listSessions",
					payload: undefined,
				};

				const listResponse = await sendRequest(control, listRequest);
				expect(listResponse.ok).toBe(true);

				if (listResponse.ok) {
					const payload = listResponse.payload as ListSessionsResponse;
					expect(payload.sessions.length).toBeGreaterThanOrEqual(2);

					const sessionIds = payload.sessions.map((s) => s.sessionId);
					expect(sessionIds).toContain("session-list-1");
					expect(sessionIds).toContain("session-list-2");
				}
			} finally {
				control.destroy();
				stream.destroy();
			}
		});
	});

	describe("session termination", () => {
		// Note: PTY operations may fail in CI environment due to bun/node-pty compatibility
		it.skip("should kill a specific session", async () => {
			const { control, stream } = await connectClient();

			try {
				// Create session
				const createRequest: IpcRequest = {
					id: "test-kill-1",
					type: "createOrAttach",
					payload: {
						sessionId: "test-session-kill",
						workspaceId: "workspace-1",
						paneId: "pane-kill",
						tabId: "tab-1",
						cols: 80,
						rows: 24,
						cwd: process.env.HOME,
					} satisfies CreateOrAttachRequest,
				};

				await sendRequest(control, createRequest);

				const isReady = await waitForSessionReady(control, "test-session-kill");
				expect(isReady).toBe(true);

				const exitPromise = waitForEvent(stream, "exit", 5000);

				// Kill session
				const killRequest: IpcRequest = {
					id: "test-kill-2",
					type: "kill",
					payload: {
						sessionId: "test-session-kill",
					},
				};

				const killResponse = await sendRequest(control, killRequest);
				expect(killResponse.ok).toBe(true);

				// Wait for exit event
				const exitEvent = await exitPromise;
				expect(exitEvent.sessionId).toBe("test-session-kill");
			} finally {
				control.destroy();
				stream.destroy();
			}
		});

		// Note: PTY operations may fail in test environment due to bun/node-pty compatibility
		it.skip("should kill all sessions", async () => {
			const { control, stream } = await connectClient();

			try {
				// Create sessions
				for (const id of ["kill-all-1", "kill-all-2"]) {
					const createRequest: IpcRequest = {
						id: `create-${id}`,
						type: "createOrAttach",
						payload: {
							sessionId: id,
							workspaceId: "workspace-1",
							paneId: `pane-${id}`,
							tabId: "tab-1",
							cols: 80,
							rows: 24,
							cwd: process.env.HOME,
						} satisfies CreateOrAttachRequest,
					};
					await sendRequest(control, createRequest);
				}

				// Kill all
				const killAllRequest: IpcRequest = {
					id: "test-killall",
					type: "killAll",
					payload: {},
				};

				const killAllResponse = await sendRequest(control, killAllRequest);
				expect(killAllResponse.ok).toBe(true);

				// Wait a bit for exits to propagate
				await new Promise((resolve) => setTimeout(resolve, 1000));

				// List should show no alive sessions
				const listRequest: IpcRequest = {
					id: "test-list-after-kill",
					type: "listSessions",
					payload: undefined,
				};

				const listResponse = await sendRequest(control, listRequest);
				expect(listResponse.ok).toBe(true);

				if (listResponse.ok) {
					const payload = listResponse.payload as ListSessionsResponse;
					const aliveSessions = payload.sessions.filter((s) => s.isAlive);
					expect(aliveSessions.length).toBe(0);
				}
			} finally {
				control.destroy();
				stream.destroy();
			}
		});
	});
});
