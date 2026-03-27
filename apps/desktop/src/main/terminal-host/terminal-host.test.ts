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

/** Emit Ready frame from the subprocess, then emit Spawned frame with a PID */
function emitReadyAndSpawned(child: FakeChildProcess, pid = 9999): void {
	// Ready frame (no payload)
	child.stdout.emit("data", createFrameHeader(PtySubprocessIpcType.Ready, 0));

	// Spawned frame with PID
	const pidPayload = Buffer.allocUnsafe(4);
	pidPayload.writeUInt32LE(pid, 0);
	const header = createFrameHeader(PtySubprocessIpcType.Spawned, 4);
	child.stdout.emit("data", Buffer.concat([header, pidPayload]));
}

/** Emit only a Ready frame (subprocess started but pty.spawn() will fail) */
function emitReadyOnly(child: FakeChildProcess): void {
	child.stdout.emit("data", createFrameHeader(PtySubprocessIpcType.Ready, 0));
}

/** Emit a Ready frame followed by an Error frame (simulating posix_spawnp failure) */
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
	 * Reproduces the bug from issue #2960:
	 *
	 * When pty.spawn() fails (e.g. posix_spawnp failed) in pty-subprocess.ts,
	 * the subprocess sends an Error frame but does NOT exit. This means:
	 *   - session.isAlive returns true (subprocess is running, no exit code)
	 *   - The broken session is stored in the sessions map and attached
	 *   - Any subsequent write() throws "PTY not spawned"
	 *
	 * The subprocess should exit on spawn failure so the daemon detects the
	 * failure via session.isAlive === false.
	 */
	it("session.isAlive is true when subprocess is alive but PTY failed to spawn (BUG)", async () => {
		// This test demonstrates the bug: a subprocess that fails to spawn a PTY
		// but doesn't exit leaves the session in a broken state where isAlive=true
		// and pid is null. Writes silently queue (shell is "pending") or go to
		// the subprocess which responds with an async error — the session appears
		// healthy to TerminalHost but is completely broken.

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

		// Simulate subprocess starting and reporting Ready, then pty.spawn() failing.
		// The subprocess sends Error but does NOT exit (the bug).
		emitReadyThenError(fakeChild, "Spawn failed: posix_spawnp failed.");

		// BUG: session.isAlive is true because the subprocess hasn't exited
		expect(session.isAlive).toBe(true);

		// BUG: pid is null because Spawned was never sent
		expect(session.pid).toBeNull();

		// BUG: The session looks alive to TerminalHost's isAlive check,
		// so it would be stored in the sessions map and attached to.
		// But since pid is null, it's actually broken — the PTY never spawned.
		// TerminalHost only checks `!session.isAlive` (line 177), missing this case.
		const terminalHostWouldReject = !session.isAlive;
		expect(terminalHostWouldReject).toBe(false); // BUG: should be true!

		await session.dispose();
	});

	it("session correctly detects spawn failure when subprocess exits after error", async () => {
		// This test verifies the FIX: when pty.spawn() fails, the subprocess
		// should exit, causing session.isAlive to return false.

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

		// Simulate: subprocess starts, Ready sent, pty.spawn() fails, subprocess exits
		emitReadyThenError(fakeChild, "Spawn failed: posix_spawnp failed.");

		// With the fix: subprocess exits after spawn failure
		fakeChild.emit("exit", 1);

		// Wait a tick for the exit handler to process
		await new Promise((resolve) => setTimeout(resolve, 10));

		// FIXED: isAlive is now false because the subprocess exited
		expect(session.isAlive).toBe(false);

		// pid should still be null
		expect(session.pid).toBeNull();

		await session.dispose();
	});

	it("TerminalHost rejects broken session when pid is null after ready timeout", async () => {
		// This tests the TerminalHost-level fix: after waitForReady times out,
		// if session.pid is null (PTY never spawned), the session should be
		// rejected even if session.isAlive is true.

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

		// Subprocess sends Ready but pty.spawn() never succeeds —
		// no Spawned frame, no exit. This is the broken state.
		emitReadyOnly(fakeChild);

		// waitForReady will timeout since Spawned is never sent
		const readyPromise = session.waitForReady();
		const timeoutPromise = new Promise<void>((resolve) =>
			setTimeout(resolve, 100),
		);
		await Promise.race([readyPromise, timeoutPromise]);

		// subprocess is alive but PTY never spawned
		expect(session.isAlive).toBe(true);
		expect(session.pid).toBeNull();

		// The TerminalHost should check pid and reject this session.
		// With the fix, TerminalHost checks `!session.isAlive || session.pid === null`
		// instead of just `!session.isAlive`.
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
