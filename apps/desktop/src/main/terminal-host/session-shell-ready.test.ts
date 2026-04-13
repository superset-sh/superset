import { describe, expect, it } from "bun:test";
import type { ChildProcess } from "node:child_process";
import { EventEmitter } from "node:events";
import {
	createFrameHeader,
	PtySubprocessFrameDecoder,
	PtySubprocessIpcType,
} from "./pty-subprocess-ipc";

/** OSC 133;A marker emitted by shell wrappers (FinalTerm standard). */
const SHELL_READY_MARKER = "\x1b]133;A\x07";
import "./xterm-env-polyfill";

const { Session } = await import("./session");

// =============================================================================
// Fakes
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

/** Simulate the subprocess reporting it's ready for commands. */
function sendReady(proc: FakeChildProcess): void {
	sendFrame(proc, PtySubprocessIpcType.Ready);
}

/** Simulate the PTY process being spawned with a given PID. */
function sendSpawned(proc: FakeChildProcess, pid = 1234): void {
	const buf = Buffer.allocUnsafe(4);
	buf.writeUInt32LE(pid, 0);
	sendFrame(proc, PtySubprocessIpcType.Spawned, buf);
}

/** Simulate PTY output data arriving. */
function sendData(proc: FakeChildProcess, data: string): void {
	sendFrame(proc, PtySubprocessIpcType.Data, Buffer.from(data, "utf8"));
}

/** Simulate the PTY process exiting. */
function sendExit(proc: FakeChildProcess, code = 0): void {
	const buf = Buffer.allocUnsafe(8);
	buf.writeInt32LE(code, 0);
	buf.writeInt32LE(0, 4);
	sendFrame(proc, PtySubprocessIpcType.Exit, buf);
}

/** Decode all Write frames sent to the subprocess stdin. */
function getWrittenData(proc: FakeChildProcess): string[] {
	const decoder = new PtySubprocessFrameDecoder();
	const frames = proc.stdin.writes.flatMap((chunk) => decoder.push(chunk));
	return frames
		.filter((f) => f.type === PtySubprocessIpcType.Write)
		.map((f) => f.payload.toString("utf8"));
}

/** Create a Session with a fake process and return both. */
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

/** Spawn a session and make it ready for writes. */
function spawnAndReady(
	session: InstanceType<typeof Session>,
	proc: FakeChildProcess,
): void {
	session.spawn({ cwd: "/tmp", cols: 80, rows: 24, env: { PATH: "/usr/bin" } });
	sendReady(proc);
	sendSpawned(proc);
}

// =============================================================================
// Tests
// =============================================================================

describe("Session shell-ready: write buffering", () => {
	it("buffers writes while shell is pending and flushes after marker", () => {
		const { session, proc } = createTestSession("/bin/zsh");
		spawnAndReady(session, proc);

		// Write before shell is ready — should be buffered
		session.write("echo hello\n");
		session.write("echo world\n");

		// No write frames should have been sent yet
		expect(getWrittenData(proc)).toEqual([]);

		// Shell emits the ready marker
		sendData(proc, `direnv output...${SHELL_READY_MARKER}prompt$ `);

		// Now the buffered writes should be flushed in order
		const writes = getWrittenData(proc);
		expect(writes).toEqual(["echo hello\n", "echo world\n"]);
	});

	it("passes writes through immediately for unsupported shells (sh)", () => {
		const { session, proc } = createTestSession("/bin/sh");
		spawnAndReady(session, proc);

		session.write("echo hello\n");

		const writes = getWrittenData(proc);
		expect(writes).toEqual(["echo hello\n"]);
	});

	it("passes writes through immediately for unsupported shells (ksh)", () => {
		const { session, proc } = createTestSession("/bin/ksh");
		spawnAndReady(session, proc);

		session.write("ls\n");

		expect(getWrittenData(proc)).toEqual(["ls\n"]);
	});

	it("drops terminal protocol responses (DA) during pending state", () => {
		const { session, proc } = createTestSession("/bin/zsh");
		spawnAndReady(session, proc);

		// Simulate DA response from renderer xterm arriving during init
		session.write("\x1b[?62;4;9;22c");
		// Simulate cursor position report
		session.write("\x1b[1;1R");
		// Queue a real preset command
		session.write("claude\n");

		// Only the preset command should be in the queue
		expect(getWrittenData(proc)).toEqual([]);

		sendData(proc, SHELL_READY_MARKER);

		// Only the command should flush — escape sequences dropped
		expect(getWrittenData(proc)).toEqual(["claude\n"]);
	});

	it("flushes buffered writes on subprocess exit", async () => {
		const { session, proc } = createTestSession("/bin/zsh");
		spawnAndReady(session, proc);

		session.write("echo delayed\n");
		expect(getWrittenData(proc)).toEqual([]);

		// Simulate exit which resolves shell readiness as timed_out
		sendExit(proc, 0);
		proc.emit("exit", 0);

		// Buffered write should now be flushed
		const writes = getWrittenData(proc);
		expect(writes).toEqual(["echo delayed\n"]);
	});
});

describe("Session shell-ready: marker detection", () => {
	it("strips marker from single data frame", () => {
		const { session, proc } = createTestSession("/bin/zsh");
		spawnAndReady(session, proc);

		// Send data with marker embedded
		sendData(proc, `before${SHELL_READY_MARKER}after`);

		// Write should now pass through (shell is ready)
		session.write("test\n");
		expect(getWrittenData(proc)).toEqual(["test\n"]);
	});

	it("detects marker split across two PTY data frames", () => {
		const { session, proc } = createTestSession("/bin/zsh");
		spawnAndReady(session, proc);

		// Split the marker roughly in half
		const half = Math.floor(SHELL_READY_MARKER.length / 2);
		const firstHalf = SHELL_READY_MARKER.slice(0, half);
		const secondHalf = SHELL_READY_MARKER.slice(half);

		// Send first half — shell should still be pending
		sendData(proc, `output${firstHalf}`);

		session.write("buffered\n");
		expect(getWrittenData(proc)).toEqual([]);

		// Send second half — should complete the marker
		sendData(proc, `${secondHalf}prompt`);

		// Now writes should flush
		expect(getWrittenData(proc)).toEqual(["buffered\n"]);
	});

	it("handles marker at start of data frame", () => {
		const { session, proc } = createTestSession("/bin/zsh");
		spawnAndReady(session, proc);

		sendData(proc, `${SHELL_READY_MARKER}prompt$ `);

		session.write("test\n");
		expect(getWrittenData(proc)).toEqual(["test\n"]);
	});

	it("handles marker at end of data frame", () => {
		const { session, proc } = createTestSession("/bin/zsh");
		spawnAndReady(session, proc);

		sendData(proc, `direnv: loading .envrc\n${SHELL_READY_MARKER}`);

		session.write("test\n");
		expect(getWrittenData(proc)).toEqual(["test\n"]);
	});

	it("handles data that looks like marker start but isn't", () => {
		const { session, proc } = createTestSession("/bin/zsh");
		spawnAndReady(session, proc);

		// Send a partial marker prefix followed by different content
		const partialMarker = SHELL_READY_MARKER.slice(0, 5);
		sendData(proc, `${partialMarker}not-a-marker`);

		// Shell should still be pending
		session.write("buffered\n");
		expect(getWrittenData(proc)).toEqual([]);

		// Now send the real marker
		sendData(proc, SHELL_READY_MARKER);
		expect(getWrittenData(proc)).toEqual(["buffered\n"]);
	});

	// Wrappers now emit both the legacy OSC 777 and the current OSC 133;A in
	// a single printf so either daemon version can detect readiness without a
	// restart. The scanner only matches 133;A — 777 passes through to the
	// emulator, which drops unknown OSC sequences silently. This test guards
	// against a future wrapper regression that swaps the order (which would
	// leave 133;A in the pre-777 slice and still work) or drops 133;A
	// entirely (which would regress readiness on the current scanner).
	it("resolves readiness when wrapper emits both 777 and 133;A markers together", () => {
		const { session, proc } = createTestSession("/bin/zsh");
		spawnAndReady(session, proc);

		session.write("buffered\n");
		expect(getWrittenData(proc)).toEqual([]);

		const COMBINED_MARKER = "\x1b]777;superset-shell-ready\x07\x1b]133;A\x07";
		sendData(proc, `direnv output...${COMBINED_MARKER}prompt$ `);

		expect(getWrittenData(proc)).toEqual(["buffered\n"]);
	});
});

describe("Session shell-ready: kill/exit before readiness", () => {
	it("flushes queue when subprocess exits before marker", () => {
		const { session, proc } = createTestSession("/bin/bash");
		spawnAndReady(session, proc);

		session.write("echo pending\n");
		expect(getWrittenData(proc)).toEqual([]);

		// Subprocess exits without ever sending the marker
		sendExit(proc, 1);
		proc.emit("exit", 1);

		// Queue should be flushed on exit
		expect(getWrittenData(proc)).toEqual(["echo pending\n"]);
	});

	it("resolves readiness when session is killed", () => {
		const { session, proc } = createTestSession("/bin/zsh");
		spawnAndReady(session, proc);

		session.write("echo pending\n");
		expect(getWrittenData(proc)).toEqual([]);

		// Kill triggers termination → subprocess exit → readiness resolved
		session.kill();
		sendExit(proc, 0);
		proc.emit("exit", 0);

		// Writes should be flushed
		expect(getWrittenData(proc)).toEqual(["echo pending\n"]);
	});
});

describe("Session shell-ready: supported shells", () => {
	for (const shell of [
		"/bin/zsh",
		"/usr/bin/zsh",
		"/bin/bash",
		"/usr/local/bin/fish",
	]) {
		it(`buffers writes for supported shell: ${shell}`, () => {
			const { session, proc } = createTestSession(shell);
			spawnAndReady(session, proc);

			session.write("test\n");
			expect(getWrittenData(proc)).toEqual([]);

			sendData(proc, SHELL_READY_MARKER);
			expect(getWrittenData(proc)).toEqual(["test\n"]);
		});
	}

	for (const shell of ["/bin/sh", "/bin/ksh", "/usr/bin/dash"]) {
		it(`passes writes through for unsupported shell: ${shell}`, () => {
			const { session, proc } = createTestSession(shell);
			spawnAndReady(session, proc);

			session.write("test\n");
			expect(getWrittenData(proc)).toEqual(["test\n"]);
		});
	}
});
