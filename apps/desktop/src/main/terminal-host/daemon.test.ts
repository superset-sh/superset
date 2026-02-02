/**
 * Terminal Host Daemon Integration Tests
 *
 * These tests verify the daemon can:
 * 1. Start and listen on a Unix socket
 * 2. Accept connections and handle NDJSON protocol
 * 3. Authenticate clients with token
 * 4. Respond to hello requests
 */

import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import type { ChildProcess } from "node:child_process";
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { connect, type Socket } from "node:net";
import { resolve } from "node:path";
import {
	type HelloResponse,
	type IpcRequest,
	type IpcResponse,
	PROTOCOL_VERSION,
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

// Timeout for daemon operations
const DAEMON_TIMEOUT = 10000;
const CONNECT_TIMEOUT = 5000;

describe("Terminal Host Daemon", () => {
	let daemonProcess: ChildProcess | null = null;

	/**
	 * Clean up any existing daemon artifacts
	 */
	function cleanup() {
		// Kill any existing daemon
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

		// Remove socket file
		if (!IS_WINDOWS && existsSync(SOCKET_PATH)) {
			try {
				rmSync(SOCKET_PATH);
			} catch {
				// Ignore
			}
		}

		// Remove PID file
		if (existsSync(PID_PATH)) {
			try {
				rmSync(PID_PATH);
			} catch {
				// Ignore
			}
		}

		// Remove token file (so we get a fresh one)
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
			// Ensure home directory exists
			if (!existsSync(SUPERSET_HOME_DIR)) {
				mkdirSync(SUPERSET_HOME_DIR, { recursive: true, mode: 0o700 });
			}

			// Start daemon with tsx (bun's typescript runner)
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
				// Check if daemon is ready
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

			// Timeout if daemon doesn't start
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

				// Force kill if it doesn't exit gracefully
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

			const onData = (data: Buffer) => {
				buffer += data.toString();
				const newlineIndex = buffer.indexOf("\n");
				if (newlineIndex !== -1) {
					const line = buffer.slice(0, newlineIndex);
					socket.off("data", onData);
					try {
						resolve(JSON.parse(line));
					} catch (_error) {
						reject(new Error(`Failed to parse response: ${line}`));
					}
				}
			};

			socket.on("data", onData);

			socket.write(`${JSON.stringify(request)}\n`);

			setTimeout(() => {
				socket.off("data", onData);
				reject(new Error("Request timed out"));
			}, 5000);
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

	describe("hello handshake", () => {
		it("should accept valid hello request with correct token", async () => {
			const socket = await connectToDaemon();

			try {
				// Read the token that the daemon generated
				const token = readFileSync(TOKEN_PATH, "utf-8").trim();
				expect(token).toHaveLength(64); // 32 bytes = 64 hex chars

				// Send hello request
				const request: IpcRequest = {
					id: "test-1",
					type: "hello",
					payload: {
						token,
						protocolVersion: PROTOCOL_VERSION,
						clientId: "test-client",
						role: "control",
					},
				};

				const response = await sendRequest(socket, request);

				expect(response.id).toBe("test-1");
				expect(response.ok).toBe(true);

				if (response.ok) {
					const payload = response.payload as HelloResponse;
					expect(payload.protocolVersion).toBe(PROTOCOL_VERSION);
					expect(payload.daemonVersion).toBe("1.0.0");
					expect(payload.daemonPid).toBeGreaterThan(0);
				}
			} finally {
				socket.destroy();
			}
		});

		it("should reject hello request with invalid token", async () => {
			const socket = await connectToDaemon();

			try {
				const request: IpcRequest = {
					id: "test-2",
					type: "hello",
					payload: {
						token: "invalid-token",
						protocolVersion: PROTOCOL_VERSION,
						clientId: "test-client",
						role: "control",
					},
				};

				const response = await sendRequest(socket, request);

				expect(response.id).toBe("test-2");
				expect(response.ok).toBe(false);

				if (!response.ok) {
					expect(response.error.code).toBe("AUTH_FAILED");
				}
			} finally {
				socket.destroy();
			}
		});

		it("should reject hello request with wrong protocol version", async () => {
			const socket = await connectToDaemon();

			try {
				const token = readFileSync(TOKEN_PATH, "utf-8").trim();

				const request: IpcRequest = {
					id: "test-3",
					type: "hello",
					payload: {
						token,
						protocolVersion: 999, // Invalid version
						clientId: "test-client",
						role: "control",
					},
				};

				const response = await sendRequest(socket, request);

				expect(response.id).toBe("test-3");
				expect(response.ok).toBe(false);

				if (!response.ok) {
					expect(response.error.code).toBe("PROTOCOL_MISMATCH");
				}
			} finally {
				socket.destroy();
			}
		});
	});

	describe("authentication requirement", () => {
		it("should reject requests before authentication", async () => {
			const socket = await connectToDaemon();

			try {
				// Try to list sessions without authenticating first
				const request: IpcRequest = {
					id: "test-4",
					type: "listSessions",
					payload: undefined,
				};

				const response = await sendRequest(socket, request);

				expect(response.id).toBe("test-4");
				expect(response.ok).toBe(false);

				if (!response.ok) {
					expect(response.error.code).toBe("NOT_AUTHENTICATED");
				}
			} finally {
				socket.destroy();
			}
		});

		it("should allow listSessions after authentication", async () => {
			const socket = await connectToDaemon();

			try {
				const token = readFileSync(TOKEN_PATH, "utf-8").trim();

				// Authenticate first
				const helloRequest: IpcRequest = {
					id: "test-5a",
					type: "hello",
					payload: {
						token,
						protocolVersion: PROTOCOL_VERSION,
						clientId: "test-client",
						role: "control",
					},
				};

				const helloResponse = await sendRequest(socket, helloRequest);
				expect(helloResponse.ok).toBe(true);

				// Now list sessions
				const listRequest: IpcRequest = {
					id: "test-5b",
					type: "listSessions",
					payload: undefined,
				};

				const listResponse = await sendRequest(socket, listRequest);

				expect(listResponse.id).toBe("test-5b");
				expect(listResponse.ok).toBe(true);

				if (listResponse.ok) {
					const payload = listResponse.payload as { sessions: unknown[] };
					expect(payload.sessions).toEqual([]);
				}
			} finally {
				socket.destroy();
			}
		});
	});

	describe("unknown requests", () => {
		it("should return error for unknown request type", async () => {
			const socket = await connectToDaemon();

			try {
				const token = readFileSync(TOKEN_PATH, "utf-8").trim();

				// Authenticate first
				const helloRequest: IpcRequest = {
					id: "test-6a",
					type: "hello",
					payload: {
						token,
						protocolVersion: PROTOCOL_VERSION,
						clientId: "test-client",
						role: "control",
					},
				};

				await sendRequest(socket, helloRequest);

				// Send unknown request
				const unknownRequest: IpcRequest = {
					id: "test-6b",
					type: "unknownRequestType",
					payload: {},
				};

				const response = await sendRequest(socket, unknownRequest);

				expect(response.id).toBe("test-6b");
				expect(response.ok).toBe(false);

				if (!response.ok) {
					expect(response.error.code).toBe("UNKNOWN_REQUEST");
				}
			} finally {
				socket.destroy();
			}
		});
	});
});
