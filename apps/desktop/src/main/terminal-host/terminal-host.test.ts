import { beforeEach, describe, expect, it } from "bun:test";
import type { ChildProcess } from "node:child_process";
import { EventEmitter } from "node:events";
import { createFrameHeader, PtySubprocessIpcType } from "./pty-subprocess-ipc";
import "./xterm-env-polyfill";

// Must import after polyfill since these transitively load @xterm/headless
const { Session } = await import("./session");

// =============================================================================
// Fakes
// =============================================================================

class FakeStdout extends EventEmitter {
	write(): boolean {
		return true;
	}
}

class FakeStdin extends EventEmitter {
	readonly writes: Buffer[] = [];

	write(chunk: Buffer | string): boolean {
		this.writes.push(
			Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk, "utf8"),
		);
		return true;
	}
}

class FakeChildProcess extends EventEmitter {
	readonly stdout = new FakeStdout();
	readonly stdin = new FakeStdin();
	pid = 4242;
	kill(): boolean {
		return true;
	}
}

// =============================================================================
// Helpers
// =============================================================================

function emitReadyAndSpawned(child: FakeChildProcess, pid = 9999): void {
	// Ready frame (no payload)
	child.stdout.emit("data", createFrameHeader(PtySubprocessIpcType.Ready, 0));

	// Spawned frame with PID
	const pidPayload = Buffer.allocUnsafe(4);
	pidPayload.writeUInt32LE(pid, 0);
	const header = createFrameHeader(PtySubprocessIpcType.Spawned, 4);
	child.stdout.emit("data", Buffer.concat([header, pidPayload]));
}

function emitReadyOnly(child: FakeChildProcess): void {
	child.stdout.emit("data", createFrameHeader(PtySubprocessIpcType.Ready, 0));
}

function emitReadyThenError(child: FakeChildProcess, errorMsg: string): void {
	// Ready frame
	child.stdout.emit("data", createFrameHeader(PtySubprocessIpcType.Ready, 0));

	// Error frame
	const errorPayload = Buffer.from(errorMsg, "utf8");
	const header = createFrameHeader(
		PtySubprocessIpcType.Error,
		errorPayload.length,
	);
	child.stdout.emit("data", Buffer.concat([header, errorPayload]));
}

// =============================================================================
// Tests
// =============================================================================

describe("TerminalHost — PTY spawn failure handling", () => {
	let fakeChild: FakeChildProcess;

	beforeEach(() => {
		fakeChild = new FakeChildProcess();
	});

	/**
	 * Reproduces the broken state from issue #2960:
	 * the subprocess reports a spawn error but stays alive, so `isAlive`
	 * remains true even though no PTY PID was ever assigned.
	 */
	it("session.isAlive is true when subprocess is alive but PTY failed to spawn (BUG)", async () => {
		const session = new Session({
			sessionId: "session-spawn-fail",
			workspaceId: "workspace-1",
			paneId: "pane-1",
			tabId: "tab-1",
			cols: 80,
			rows: 24,
			cwd: "/tmp",
			shell: "/bin/bash",
			spawnProcess: () => fakeChild as unknown as ChildProcess,
		});

		session.spawn({
			cwd: "/tmp",
			cols: 80,
			rows: 24,
			env: { PATH: "/usr/bin" },
		});

		// Spawn fails after Ready, but the subprocess never exits.
		emitReadyThenError(fakeChild, "Spawn failed: posix_spawnp failed.");

		expect(session.isAlive).toBe(true);
		expect(session.pid).toBeNull();

		const terminalHostWouldReject = !session.isAlive;
		expect(terminalHostWouldReject).toBe(false);

		await session.dispose();
	});

	it("session correctly detects spawn failure when subprocess exits after error", async () => {
		const session = new Session({
			sessionId: "session-spawn-fail-fixed",
			workspaceId: "workspace-1",
			paneId: "pane-1",
			tabId: "tab-1",
			cols: 80,
			rows: 24,
			cwd: "/tmp",
			shell: "/bin/bash",
			spawnProcess: () => fakeChild as unknown as ChildProcess,
		});

		session.spawn({
			cwd: "/tmp",
			cols: 80,
			rows: 24,
			env: { PATH: "/usr/bin" },
		});

		// Spawn fails, then the subprocess exits.
		emitReadyThenError(fakeChild, "Spawn failed: posix_spawnp failed.");
		fakeChild.emit("exit", 1);

		await new Promise((resolve) => setTimeout(resolve, 10));

		expect(session.isAlive).toBe(false);
		expect(session.pid).toBeNull();

		await session.dispose();
	});

	it("TerminalHost rejects broken session when pid is null after ready timeout", async () => {
		const session = new Session({
			sessionId: "session-no-pid",
			workspaceId: "workspace-1",
			paneId: "pane-1",
			tabId: "tab-1",
			cols: 80,
			rows: 24,
			cwd: "/tmp",
			shell: "/bin/bash",
			spawnProcess: () => fakeChild as unknown as ChildProcess,
		});

		session.spawn({
			cwd: "/tmp",
			cols: 80,
			rows: 24,
			env: { PATH: "/usr/bin" },
		});

		// Ready arrives, but PTY spawn never completes.
		emitReadyOnly(fakeChild);

		const readyPromise = session.waitForReady();
		const timeoutPromise = new Promise<void>((resolve) =>
			setTimeout(resolve, 100),
		);
		await Promise.race([readyPromise, timeoutPromise]);

		expect(session.isAlive).toBe(true);
		expect(session.pid).toBeNull();

		const shouldReject = !session.isAlive || session.pid === null;
		expect(shouldReject).toBe(true);

		await session.dispose();
	});

	it("healthy session has both isAlive=true and pid set", async () => {
		const session = new Session({
			sessionId: "session-healthy",
			workspaceId: "workspace-1",
			paneId: "pane-1",
			tabId: "tab-1",
			cols: 80,
			rows: 24,
			cwd: "/tmp",
			shell: "/bin/bash",
			spawnProcess: () => fakeChild as unknown as ChildProcess,
		});

		session.spawn({
			cwd: "/tmp",
			cols: 80,
			rows: 24,
			env: { PATH: "/usr/bin" },
		});

		// Simulate successful spawn
		emitReadyAndSpawned(fakeChild, 12345);

		await session.waitForReady();

		expect(session.isAlive).toBe(true);
		expect(session.pid).toBe(12345);

		await session.dispose();
	});
});
