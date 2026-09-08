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

function emitData(child: FakeChildProcess, text: string): void {
	const payload = Buffer.from(text, "utf8");
	const header = createFrameHeader(PtySubprocessIpcType.Data, payload.length);
	child.stdout.emit("data", Buffer.concat([header, payload]));
}

function emitExit(child: FakeChildProcess, exitCode: number, signal = 0): void {
	const payload = Buffer.allocUnsafe(8);
	payload.writeInt32LE(exitCode, 0);
	payload.writeInt32LE(signal, 4);
	const header = createFrameHeader(PtySubprocessIpcType.Exit, 8);
	child.stdout.emit("data", Buffer.concat([header, payload]));
}

describe("TerminalHost — spawn failure cause", () => {
	let fakeChild: FakeChildProcess;

	beforeEach(() => {
		fakeChild = new FakeChildProcess();
	});

	function spawnSession(shell = "/bin/zsh") {
		const session = new Session({
			sessionId: "session-cause",
			workspaceId: "workspace-1",
			paneId: "pane-1",
			tabId: "tab-1",
			cols: 80,
			rows: 24,
			cwd: "/tmp",
			shell,
			spawnProcess: () => fakeChild as unknown as ChildProcess,
		});
		session.spawn({
			cwd: "/tmp",
			cols: 80,
			rows: 24,
			env: { PATH: "/usr/bin" },
		});
		return session;
	}

	it("reports SHELL_EXITED with exit code, signal, shell, args and output when the PTY opened and the shell died", async () => {
		const session = spawnSession("/bin/zsh");
		emitReadyAndSpawned(fakeChild, 555);
		emitData(fakeChild, "/Users/me/.zshrc:3: parse error near `}'\r\n");
		emitExit(fakeChild, 1);

		expect(session.isAlive).toBe(false);
		expect(session.describeSpawnFailure()).toEqual({
			kind: "SHELL_EXITED",
			shell: "/bin/zsh",
			args: ["-l"],
			exitCode: 1,
			signal: undefined,
			outputHead: "/Users/me/.zshrc:3: parse error near `}'\r\n",
		});

		await session.dispose();
	});

	it("keeps the signal when the shell was killed", async () => {
		const session = spawnSession();
		emitReadyAndSpawned(fakeChild, 555);
		emitExit(fakeChild, 0, 9);

		expect(session.describeSpawnFailure()).toMatchObject({
			kind: "SHELL_EXITED",
			exitCode: 0,
			signal: 9,
		});

		await session.dispose();
	});

	it("caps the captured output head at 2048 characters", async () => {
		const session = spawnSession();
		emitReadyAndSpawned(fakeChild, 555);
		emitData(fakeChild, "x".repeat(5000));
		emitExit(fakeChild, 1);

		const failure = session.describeSpawnFailure();
		expect(failure.kind).toBe("SHELL_EXITED");
		if (failure.kind === "SHELL_EXITED") {
			expect(failure.outputHead).toHaveLength(2048);
		}

		await session.dispose();
	});

	it("counts multibyte output in characters and never splits a surrogate pair", async () => {
		const session = spawnSession();
		emitReadyAndSpawned(fakeChild, 555);
		// "✗" is one character over 3 bytes and each emoji is a surrogate pair,
		// so the 2048-code-unit cap lands mid-pair after that odd-length prefix.
		emitData(fakeChild, `✗${"🔥".repeat(2000)}`);
		emitExit(fakeChild, 1);

		const failure = session.describeSpawnFailure();
		expect(failure.kind).toBe("SHELL_EXITED");
		if (failure.kind === "SHELL_EXITED") {
			expect(failure.outputHead).toHaveLength(2047);
			expect(failure.outputHead.startsWith("✗🔥")).toBe(true);
			// A dangling half-pair would come back as U+FFFD once encoded.
			expect(Buffer.from(failure.outputHead, "utf8").toString("utf8")).toBe(
				failure.outputHead,
			);
		}

		await session.dispose();
	});

	it("does NOT report SHELL_EXITED when the PTY helper failed before opening a PTY", async () => {
		const session = spawnSession();
		emitReadyThenError(fakeChild, "Spawn failed: posix_spawn failed: EAGAIN");
		fakeChild.emit("exit", 1);

		expect(session.describeSpawnFailure()).toEqual({
			kind: "PTY_SPAWN_FAILED",
			shell: "/bin/zsh",
			exitCode: 1,
			error: "Spawn failed: posix_spawn failed: EAGAIN",
		});

		await session.dispose();
	});

	it("does NOT report SHELL_EXITED when the helper process itself could not start", async () => {
		const session = spawnSession();
		fakeChild.emit("error", new Error("spawn EBADF"));

		expect(session.describeSpawnFailure()).toEqual({
			kind: "PTY_SPAWN_FAILED",
			shell: "/bin/zsh",
			exitCode: -1,
			error: "spawn EBADF",
		});

		await session.dispose();
	});

	it("reports PTY_SPAWN_TIMEOUT when the helper is alive but never opened a PTY", async () => {
		const session = spawnSession();
		emitReadyOnly(fakeChild);

		expect(session.isAlive).toBe(true);
		expect(session.pid).toBeNull();
		expect(session.describeSpawnFailure()).toEqual({
			kind: "PTY_SPAWN_TIMEOUT",
			shell: "/bin/zsh",
		});

		await session.dispose();
	});
});
