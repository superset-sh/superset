/**
 * Regression test for GitHub issue #3325
 *
 * When the headless emulator receives a DSR query (ESC[6n) from PTY output,
 * it generates a Cursor Position Report (CPR) response like ESC[24;1R.
 * Before the fix, this response was forwarded to the subprocess stdin.
 * If a subprocess like `gh pr checkout` had briefly changed terminal raw mode,
 * the CPR response could leak into the shell's stdin as visible text (`;1R`).
 *
 * The fix filters CPR responses from the emulator's onData callback so they
 * are never written to the subprocess.
 */

import { describe, expect, it } from "bun:test";
import type { ChildProcess } from "node:child_process";
import { EventEmitter } from "node:events";
import {
	createFrameHeader,
	PtySubprocessFrameDecoder,
	PtySubprocessIpcType,
	SHELL_READY_MARKER,
} from "./pty-subprocess-ipc";
import "./xterm-env-polyfill";

const { Session } = await import("./session");

// =============================================================================
// Fakes (same as session-shell-ready.test.ts)
// =============================================================================

class FakeStdout extends EventEmitter {}

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

function sendFrame(
	proc: FakeChildProcess,
	type: PtySubprocessIpcType,
	payload?: Buffer,
): void {
	const buf = payload ?? Buffer.alloc(0);
	const header = createFrameHeader(type, buf.length);
	proc.stdout.emit("data", Buffer.concat([header, buf]));
}

function sendReady(proc: FakeChildProcess): void {
	sendFrame(proc, PtySubprocessIpcType.Ready);
}

function sendSpawned(proc: FakeChildProcess, pid = 1234): void {
	const buf = Buffer.allocUnsafe(4);
	buf.writeUInt32LE(pid, 0);
	sendFrame(proc, PtySubprocessIpcType.Spawned, buf);
}

function sendData(proc: FakeChildProcess, data: string): void {
	sendFrame(proc, PtySubprocessIpcType.Data, Buffer.from(data, "utf8"));
}

/** Decode all Write frames sent to the subprocess stdin. */
function getWrittenData(proc: FakeChildProcess): string[] {
	const decoder = new PtySubprocessFrameDecoder();
	const frames = proc.stdin.writes.flatMap((chunk) => decoder.push(chunk));
	return frames
		.filter((f) => f.type === PtySubprocessIpcType.Write)
		.map((f) => f.payload.toString("utf8"));
}

function createTestSession(shell: string): {
	session: InstanceType<typeof Session>;
	proc: FakeChildProcess;
} {
	const proc = new FakeChildProcess();
	const session = new Session({
		sessionId: `session-${Date.now()}`,
		workspaceId: "ws-1",
		paneId: "pane-1",
		tabId: "tab-1",
		cols: 80,
		rows: 24,
		cwd: "/tmp",
		shell,
		spawnProcess: () => proc as unknown as ChildProcess,
	});
	return { session, proc };
}

function spawnAndReady(
	session: InstanceType<typeof Session>,
	proc: FakeChildProcess,
): void {
	session.spawn({
		cwd: "/tmp",
		cols: 80,
		rows: 24,
		env: { PATH: "/usr/bin" },
	});
	sendReady(proc);
	sendSpawned(proc);
}

// =============================================================================
// Tests
// =============================================================================

describe("Issue #3325: CPR response leak to subprocess", () => {
	it("does not forward CPR (cursor position report) to subprocess", async () => {
		const { session, proc } = createTestSession("/bin/zsh");
		spawnAndReady(session, proc);

		// Make shell ready so writes pass through
		sendData(proc, SHELL_READY_MARKER);

		// Clear any startup writes
		proc.stdin.writes.length = 0;

		// Simulate shell/prompt sending ESC[6n (DSR cursor position query)
		// through PTY output. The headless emulator will process this and
		// generate a CPR response like ESC[1;1R via its onData callback.
		sendData(proc, "\x1b[6n");

		// Allow microtasks to settle (emulator writes are queued)
		await new Promise((resolve) => setTimeout(resolve, 50));

		// The CPR response (ESC[row;colR) must NOT appear in subprocess stdin.
		// Before the fix, this would contain ["\x1b[1;1R"] or similar.
		const writes = getWrittenData(proc);
		// ESC [ digits ; digits R
		const cprWrites = writes.filter(
			(w) =>
				w.charCodeAt(0) === 0x1b &&
				w[1] === "[" &&
				w.endsWith("R") &&
				/^\d+;\d+$/.test(w.slice(2, -1)),
		);
		expect(cprWrites).toEqual([]);
	});

	it("still forwards DA1 responses to subprocess", async () => {
		const { session, proc } = createTestSession("/bin/zsh");
		spawnAndReady(session, proc);

		// Make shell ready
		sendData(proc, SHELL_READY_MARKER);

		// Clear any startup writes
		proc.stdin.writes.length = 0;

		// Simulate shell sending DA1 query (ESC[c) through PTY output.
		// The headless emulator should generate a DA1 response and it
		// MUST be forwarded — fish shells depend on this at startup.
		sendData(proc, "\x1b[c");

		// Allow microtasks to settle
		await new Promise((resolve) => setTimeout(resolve, 50));

		// DA1 responses (ESC[?...c) should still be forwarded
		const writes = getWrittenData(proc);
		// Match ESC [ ? digits-and-semicolons c
		const da1Writes = writes.filter(
			(w) =>
				w.charCodeAt(0) === 0x1b &&
				w.startsWith("[?", 1) &&
				w.endsWith("c") &&
				/^[\d;]+$/.test(w.slice(3, -1)),
		);
		expect(da1Writes.length).toBeGreaterThan(0);
	});

	it("does not forward CPR even with varying row/col values", async () => {
		const { session, proc } = createTestSession("/bin/bash");
		spawnAndReady(session, proc);
		sendData(proc, SHELL_READY_MARKER);

		proc.stdin.writes.length = 0;

		// Send multiple DSR queries — each triggers a CPR from the emulator
		sendData(proc, "\x1b[6n");
		sendData(proc, "some output\r\n");
		sendData(proc, "\x1b[6n");

		await new Promise((resolve) => setTimeout(resolve, 50));

		const writes = getWrittenData(proc);
		// ESC [ digits ; digits R
		const cprWrites = writes.filter(
			(w) =>
				w.charCodeAt(0) === 0x1b &&
				w[1] === "[" &&
				w.endsWith("R") &&
				/^\d+;\d+$/.test(w.slice(2, -1)),
		);
		expect(cprWrites).toEqual([]);
	});
});
