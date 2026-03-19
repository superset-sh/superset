import { beforeEach, describe, expect, it, mock, spyOn } from "bun:test";
import { EventEmitter } from "node:events";

/**
 * Tests for TerminalHostClient.restartDaemon()
 *
 * Verifies that on app restart, the client shuts down any existing daemon
 * and spawns a fresh one. This ensures the new daemon inherits the current
 * user's security session context — critical on macOS where Fast User
 * Switching can leave a stale daemon with a degraded security context
 * (causing TLS/Keychain failures for Go binaries, `security` CLI, etc.).
 *
 * See: https://github.com/anthropics/superset/issues/2570
 */

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const fsState = {
	existingPaths: new Set<string>(),
	writtenFiles: new Map<string, string>(),
	unlinkedPaths: new Set<string>(),
	readFiles: new Map<string, string>(),
};

mock.module("node:fs", () => {
	const realFs = require("node:fs");
	const overrides = {
		existsSync: (path: string) => fsState.existingPaths.has(path),
		readFileSync: (path: string, ...args: unknown[]) => {
			const content = fsState.readFiles.get(path);
			if (content !== undefined) return content;
			return realFs.readFileSync(path, ...args);
		},
		writeFileSync: (path: string, data: string) => {
			fsState.writtenFiles.set(path, data);
			fsState.existingPaths.add(path);
		},
		unlinkSync: (path: string) => {
			fsState.unlinkedPaths.add(path);
			fsState.existingPaths.delete(path);
		},
		mkdirSync: () => {},
		chmodSync: () => {},
		statSync: () => ({ mtimeMs: 0 }),
		openSync: () => 3,
		closeSync: () => {},
	};
	return {
		...realFs,
		...overrides,
		default: { ...realFs, ...overrides },
	};
});

let connectFn: (path: string) => EventEmitter;

mock.module("node:net", () => ({
	connect: (path: string) => connectFn(path),
}));

mock.module("electron", () => ({
	app: {
		isPackaged: false,
		getAppPath: () => "/mock/app",
	},
}));

mock.module("shared/constants", () => ({
	SUPERSET_DIR_NAME: ".superset-test",
}));

const spawnCalls: Array<{ cmd: string; args: string[] }> = [];

/** Called by spawn mock to simulate daemon creating its socket file. */
let onSpawn: (() => void) | null = null;

const mockChildProcess = new EventEmitter();
Object.assign(mockChildProcess, {
	pid: 99999,
	unref: () => {},
});

mock.module("node:child_process", () => {
	const realCp = require("node:child_process");
	const overrides = {
		spawn: (cmd: string, args: string[]) => {
			spawnCalls.push({ cmd, args });
			onSpawn?.();
			return mockChildProcess;
		},
	};
	return { ...realCp, ...overrides, default: { ...realCp, ...overrides } };
});

const { TerminalHostClient } = await import("./client");

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const HOME = require("node:os").homedir();
const SUPERSET_HOME = require("node:path").join(HOME, ".superset-test");
const SOCKET_PATH = require("node:path").join(
	SUPERSET_HOME,
	"terminal-host.sock",
);
const TOKEN_PATH = require("node:path").join(
	SUPERSET_HOME,
	"terminal-host.token",
);
const PID_PATH = require("node:path").join(SUPERSET_HOME, "terminal-host.pid");
const DAEMON_SCRIPT = "/mock/app/dist/main/terminal-host.js";

function resetState() {
	fsState.existingPaths.clear();
	fsState.writtenFiles.clear();
	fsState.unlinkedPaths.clear();
	fsState.readFiles.clear();
	spawnCalls.length = 0;
	onSpawn = null;
}

function createMockSocket(
	responseMap: Record<string, unknown> = {},
): EventEmitter {
	const socket = new EventEmitter() as EventEmitter & {
		write: (data: string) => boolean;
		destroy: () => void;
		unref: () => void;
		setEncoding: (enc: string) => void;
		remoteAddress: string;
	};
	socket.remoteAddress = "mock";
	socket.unref = () => {};
	socket.setEncoding = () => {};
	socket.destroy = () => {};

	socket.write = (data: string) => {
		try {
			const req = JSON.parse(data.trim());
			const payload = responseMap[req.type];
			if (payload !== undefined) {
				const response = JSON.stringify({
					id: req.id,
					ok: true,
					payload,
				});
				setTimeout(() => socket.emit("data", `${response}\n`), 0);
			}
		} catch {
			// Not NDJSON
		}
		return true;
	};

	setTimeout(() => socket.emit("connect"), 0);
	return socket;
}

function createFailingSocket(): EventEmitter {
	const socket = new EventEmitter() as EventEmitter & {
		write: (data: string) => boolean;
		destroy: () => void;
		unref: () => void;
		setEncoding: (enc: string) => void;
	};
	socket.write = () => true;
	socket.destroy = () => {};
	socket.unref = () => {};
	socket.setEncoding = () => {};
	setTimeout(() => socket.emit("error", new Error("ECONNREFUSED")), 0);
	return socket;
}

const HELLO_RESPONSE = {
	protocolVersion: 2,
	daemonVersion: "1.0.0",
	daemonPid: 99999,
};

/** Set up onSpawn to simulate the daemon creating its socket + token files. */
function simulateDaemonSpawn(token = "new-token-xyz") {
	onSpawn = () => {
		fsState.existingPaths.add(SOCKET_PATH);
		fsState.existingPaths.add(TOKEN_PATH);
		fsState.readFiles.set(TOKEN_PATH, token);
	};
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("TerminalHostClient.restartDaemon", () => {
	beforeEach(() => {
		resetState();
	});

	it("shuts down a running daemon and removes stale files before spawning fresh", async () => {
		// Existing daemon files
		fsState.existingPaths.add(SOCKET_PATH);
		fsState.existingPaths.add(TOKEN_PATH);
		fsState.existingPaths.add(PID_PATH);
		fsState.existingPaths.add(DAEMON_SCRIPT);
		fsState.readFiles.set(TOKEN_PATH, "test-token-abc");
		fsState.readFiles.set(PID_PATH, "12345");

		simulateDaemonSpawn();

		let connectCount = 0;
		connectFn = () => {
			connectCount++;

			// 1st connect: tryConnectControl for graceful shutdown
			if (connectCount === 1) {
				return createMockSocket({
					hello: HELLO_RESPONSE,
					shutdown: { success: true },
				});
			}

			// 2nd: waitForDaemonShutdown isSocketLive check — daemon gone
			if (connectCount === 2) {
				fsState.existingPaths.delete(SOCKET_PATH);
				return createFailingSocket();
			}

			// 3rd+: new daemon sockets (control + stream after spawn)
			return createMockSocket({ hello: HELLO_RESPONSE });
		};

		const client = new TerminalHostClient();
		await client.restartDaemon();

		// Graceful shutdown was sent (socket accepted the shutdown request)
		// and old token file was cleaned up (removed either by daemon or cleanup)
		expect(fsState.unlinkedPaths.has(TOKEN_PATH)).toBe(true);

		// New daemon was spawned
		expect(spawnCalls.length).toBeGreaterThanOrEqual(1);
		expect(spawnCalls[0]?.args[0]).toContain("terminal-host.js");

		client.dispose();
	});

	it("falls back to SIGTERM via PID file when socket is not connectable", async () => {
		fsState.existingPaths.add(SOCKET_PATH);
		fsState.existingPaths.add(PID_PATH);
		fsState.existingPaths.add(TOKEN_PATH);
		fsState.existingPaths.add(DAEMON_SCRIPT);
		fsState.readFiles.set(PID_PATH, "12345");

		const killSpy = spyOn(process, "kill").mockImplementation(() => true);
		simulateDaemonSpawn();

		let connectCount = 0;
		connectFn = () => {
			connectCount++;

			// 1st: tryConnectControl fails (daemon unresponsive)
			if (connectCount === 1) {
				return createFailingSocket();
			}

			// 2nd: waitForDaemonShutdown — socket gone
			if (connectCount === 2) {
				fsState.existingPaths.delete(SOCKET_PATH);
				return createFailingSocket();
			}

			// 3rd+: new daemon
			return createMockSocket({ hello: HELLO_RESPONSE });
		};

		const client = new TerminalHostClient();
		await client.restartDaemon();

		expect(killSpy).toHaveBeenCalledWith(12345, "SIGTERM");
		expect(spawnCalls.length).toBeGreaterThanOrEqual(1);

		killSpy.mockRestore();
		client.dispose();
	});

	it("spawns fresh daemon when no existing daemon is running", async () => {
		// No socket/pid/token files — clean state
		fsState.existingPaths.add(DAEMON_SCRIPT);
		simulateDaemonSpawn("fresh-token");

		connectFn = () => {
			// All connects go to the freshly spawned daemon
			return createMockSocket({ hello: HELLO_RESPONSE });
		};

		const client = new TerminalHostClient();
		await client.restartDaemon();

		expect(spawnCalls.length).toBeGreaterThanOrEqual(1);
		client.dispose();
	});
});
