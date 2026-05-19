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

describe("Session shell-ready: write pass-through", () => {
	it("passes writes through immediately while shell is pending (#3478)", () => {
		const { session, proc } = createTestSession("/bin/zsh");
		spawnAndReady(session, proc);

		// User keystrokes answering a shell-init prompt (e.g. fnm's
		// "install missing Node version?") must reach the PTY without
		// waiting for OSC 133;A.
		session.write("y\n");
		session.write("echo ready\n");

		expect(getWrittenData(proc)).toEqual(["y\n", "echo ready\n"]);

		// The ready marker arriving later must not re-emit anything.
		sendData(proc, `direnv output...${SHELL_READY_MARKER}prompt$ `);
		expect(getWrittenData(proc)).toEqual(["y\n", "echo ready\n"]);
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
		// Regular command also arriving during pending
		session.write("claude\n");

		// Escape sequences are dropped; the command passes through.
		expect(getWrittenData(proc)).toEqual(["claude\n"]);

		sendData(proc, SHELL_READY_MARKER);

		// Nothing new to emit after the marker.
		expect(getWrittenData(proc)).toEqual(["claude\n"]);
	});

	it("forwards escape sequences once shell is ready", () => {
		const { session, proc } = createTestSession("/bin/zsh");
		spawnAndReady(session, proc);

		sendData(proc, SHELL_READY_MARKER);

		// After the marker, escape sequences are no longer stale init noise,
		// so they pass through (e.g. user pressing arrow keys).
		session.write("\x1b[A");
		expect(getWrittenData(proc)).toEqual(["\x1b[A"]);
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

		// Writes pass through even while pending
		session.write("first\n");
		expect(getWrittenData(proc)).toEqual(["first\n"]);

		// Send second half — should complete the marker
		sendData(proc, `${secondHalf}prompt`);

		// Post-marker writes still pass through
		session.write("second\n");
		expect(getWrittenData(proc)).toEqual(["first\n", "second\n"]);
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

		// Writes pass through regardless of marker state.
		session.write("first\n");
		expect(getWrittenData(proc)).toEqual(["first\n"]);

		// Now send the real marker — no backlog to flush.
		sendData(proc, SHELL_READY_MARKER);
		expect(getWrittenData(proc)).toEqual(["first\n"]);
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

		const COMBINED_MARKER = "\x1b]777;superset-shell-ready\x07\x1b]133;A\x07";
		sendData(proc, `direnv output...${COMBINED_MARKER}prompt$ `);

		// Writes after the combined marker pass through (marker detection
		// guards future behaviors that may depend on the ready state).
		session.write("test\n");
		expect(getWrittenData(proc)).toEqual(["test\n"]);
	});
});

describe("Session shell-ready: kill/exit before readiness", () => {
	it("accepts writes when subprocess exits before marker", () => {
		const { session, proc } = createTestSession("/bin/bash");
		spawnAndReady(session, proc);

		// Writes pass through even during pending.
		session.write("echo pending\n");
		expect(getWrittenData(proc)).toEqual(["echo pending\n"]);

		// Subprocess exits without ever sending the marker — no replay,
		// no duplicate writes.
		sendExit(proc, 1);
		proc.emit("exit", 1);

		expect(getWrittenData(proc)).toEqual(["echo pending\n"]);
	});

	it("accepts writes when session is killed before marker", () => {
		const { session, proc } = createTestSession("/bin/zsh");
		spawnAndReady(session, proc);

		session.write("echo pending\n");
		expect(getWrittenData(proc)).toEqual(["echo pending\n"]);

		// Kill triggers termination → subprocess exit → readiness resolved.
		// No buffered replay on exit.
		session.kill();
		sendExit(proc, 0);
		proc.emit("exit", 0);

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
		it(`passes writes through while pending for supported shell: ${shell}`, () => {
			const { session, proc } = createTestSession(shell);
			spawnAndReady(session, proc);

			session.write("test\n");
			expect(getWrittenData(proc)).toEqual(["test\n"]);

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

describe("Session terminal-query response duplication (#4013)", () => {
	// Build regexes via string composition — Biome forbids \x1b control chars
	// in literal regex syntax, so we avoid /\x1b.../ here.
	const ESC_RE = "\\u001b";
	// CPR response shape: ESC [ <row> ; <col> R
	const cprResponseRe = new RegExp(`${ESC_RE}\\[\\d+;\\d+R`, "g");
	// DA1 response shape: ESC [ ? <params> c
	const da1ResponseRe = new RegExp(`${ESC_RE}\\[\\?[\\d;]+c`);

	/**
	 * Wait for the emulator write queue (setImmediate-scheduled) to drain AND
	 * for xterm's async parser to finish processing it. Calling emulator.flush()
	 * via the same callback xterm uses internally guarantees both the write
	 * queue has been pumped and the parser has emitted any onData responses.
	 */
	const flushEmulator = async (
		session: InstanceType<typeof Session>,
	): Promise<void> => {
		const emulator = (
			session as unknown as { emulator: { flush(): Promise<void> } }
		).emulator;
		// Tick once to let processEmulatorWriteQueue run, then flush xterm.
		await new Promise<void>((resolve) => setImmediate(resolve));
		await emulator.flush();
		// One more tick so any onData → sendWriteToSubprocess is observable.
		await new Promise<void>((resolve) => setImmediate(resolve));
	};

	/** Mark a renderer client as attached without driving the full attach flow. */
	const attachFakeClient = (session: InstanceType<typeof Session>): void => {
		const attachedClients = (
			session as unknown as {
				attachedClients: Map<
					unknown,
					{ socket: unknown; attachedAt: number; attachToken: symbol }
				>;
			}
		).attachedClients;
		const socket = {
			write: () => true,
			off: () => {},
			once: () => {},
		};
		attachedClients.set(socket, {
			socket,
			attachedAt: Date.now(),
			attachToken: Symbol("attach"),
		});
	};

	it("does not duplicate CPR responses when shell is ready and a renderer is attached", async () => {
		const { session, proc } = createTestSession("/bin/zsh");
		spawnAndReady(session, proc);
		attachFakeClient(session);

		// Move past the pending phase. After OSC 133;A, the renderer's xterm
		// query responses pass through to the PTY (see write() filter logic),
		// so the headless emulator must NOT also forward its own responses.
		sendData(proc, SHELL_READY_MARKER);

		// Simulate a foreground process (e.g. termenv/lipgloss) sending an
		// OSC 11 background-color query immediately followed by a CSI 6n
		// cursor-position query — exactly the sequence in the bug report.
		sendData(proc, "\x1b]11;?\x1b\\\x1b[6n");
		await flushEmulator(session);

		// Capture what the headless emulator forwarded before the renderer
		// chimes in — this is what causes the duplication in #4013.
		const headlessOnlyJoined = getWrittenData(proc).join("");
		const headlessCprMatches = headlessOnlyJoined.match(cprResponseRe) ?? [];

		// Simulate the renderer's xterm replying to both queries via the
		// write() path (this is what the renderer would do once shellReady=true).
		session.write("\x1b]11;rgb:1515/1111/1010\x1b\\");
		session.write("\x1b[1;1R");

		const writtenJoined = getWrittenData(proc).join("");
		const cprMatches = writtenJoined.match(cprResponseRe) ?? [];

		// Headless must NOT forward a CPR response once a renderer is
		// attached and the shell is ready — the renderer is authoritative
		// for query responses. Forwarding the duplicate leaks `[1;1R` into
		// shell input after the next prompt.
		expect(headlessCprMatches.length).toBe(0);

		// And the total in the PTY stdin must contain exactly one CPR (the
		// renderer's), not two.
		expect(cprMatches.length).toBe(1);
	});

	it("still forwards headless responses when shell is ready but no renderer is attached", async () => {
		const { session, proc } = createTestSession("/bin/zsh");
		spawnAndReady(session, proc);

		sendData(proc, SHELL_READY_MARKER);

		// With no renderer attached, the headless emulator is the only
		// possible responder. It must keep answering CPR so apps that send
		// queries against a backgrounded session still receive replies.
		sendData(proc, "\x1b[6n");
		await flushEmulator(session);

		const writtenJoined = getWrittenData(proc).join("");
		expect(writtenJoined).toMatch(new RegExp(`${ESC_RE}\\[\\d+;\\d+R`));
	});

	it("still forwards headless emulator responses while shell is pending (preserves fish DA1 behavior)", async () => {
		const { session, proc } = createTestSession("/bin/zsh");
		spawnAndReady(session, proc);

		// During pending, renderer responses are dropped (they look like typed
		// text), so the headless emulator must answer terminal queries the
		// shell sends at startup. Without this, fish hangs ~10s on DA1.
		sendData(proc, "\x1b[c");
		await flushEmulator(session);

		const writtenJoined = getWrittenData(proc).join("");
		// xterm answers DA1 with a "?...c" response — make sure it reaches the PTY.
		expect(writtenJoined).toMatch(da1ResponseRe);
	});
});
