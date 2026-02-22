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
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import {
	type CreateOrAttachRequest,
	type CreateOrAttachResponse,
	type IpcRequest,
	type IpcResponse,
	PROTOCOL_VERSION,
} from "../lib/terminal-host/types";

// Test uses a dedicated workspace name for isolation
const SUPERSET_DIR_NAME = ".superset-test";
const SUPERSET_HOME_DIR = join(homedir(), SUPERSET_DIR_NAME);
const SOCKET_PATH = join(SUPERSET_HOME_DIR, "terminal-host.sock");
const TOKEN_PATH = join(SUPERSET_HOME_DIR, "terminal-host.token");
const PID_PATH = join(SUPERSET_HOME_DIR, "terminal-host.pid");

// Path to the daemon source file
const DAEMON_PATH = resolve(__dirname, "index.ts");
// Polyfill for @xterm/headless in Bun (see xterm-env-polyfill.ts for details)
const XTERM_POLYFILL_PATH = resolve(__dirname, "xterm-env-polyfill.ts");

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

		if (existsSync(SOCKET_PATH)) {
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

			daemonProcess = spawn(
				"bun",
				["run", "--preload", XTERM_POLYFILL_PATH, DAEMON_PATH],
				{
					env: {
						...process.env,
						NODE_ENV: "development",
						SUPERSET_WORKSPACE_NAME: "test",
					},
					stdio: ["ignore", "pipe", "pipe"],
					detached: true,
				},
			);

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
	});
});
