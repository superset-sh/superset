/**
 * Reproduces the duplicate query-response leak from issues #4013 and #4041.
 *
 * After the shell becomes ready, both the headless emulator (main process)
 * and the renderer's xterm answer terminal-capability queries (DA1, DSR,
 * OSC 10/11/12). The headless emulator's reply is forwarded to the PTY
 * directly; the renderer's reply travels back as a `Session.write()` call.
 *
 * If both replies reach the PTY, the foreground process consumes one and
 * the duplicate sits in the slave's input buffer. After the foreground
 * exits, the shell consumes the leftover as if it were typed input —
 * surfacing as stray `?62;4;9;22c` / `11;rgb:1515/1111/1010` text at the
 * prompt (the leading ESC gets eaten by the line discipline, the rest
 * leaks).
 */

import { describe, expect, it } from "bun:test";
import type { ChildProcess } from "node:child_process";
import { EventEmitter } from "node:events";
import {
	createFrameHeader,
	PtySubprocessFrameDecoder,
	PtySubprocessIpcType,
} from "./pty-subprocess-ipc";
import "./xterm-env-polyfill";

const SHELL_READY_MARKER = "\x1b]133;A\x07";

const { Session } = await import("./session");

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

function getWrittenData(proc: FakeChildProcess): string[] {
	const decoder = new PtySubprocessFrameDecoder();
	const frames = proc.stdin.writes.flatMap((chunk) => decoder.push(chunk));
	return frames
		.filter((f) => f.type === PtySubprocessIpcType.Write)
		.map((f) => f.payload.toString("utf8"));
}

function createTestSession(): {
	session: InstanceType<typeof Session>;
	proc: FakeChildProcess;
} {
	const proc = new FakeChildProcess();
	const session = new Session({
		sessionId: `session-${Date.now()}-${Math.random()}`,
		workspaceId: "ws-1",
		paneId: "pane-1",
		tabId: "tab-1",
		cols: 80,
		rows: 24,
		cwd: "/tmp",
		shell: "/bin/zsh",
		spawnProcess: () => proc as unknown as ChildProcess,
	});
	return { session, proc };
}

function spawnReadyAndMarkShellReady(
	session: InstanceType<typeof Session>,
	proc: FakeChildProcess,
): void {
	session.spawn({ cwd: "/tmp", cols: 80, rows: 24, env: { PATH: "/usr/bin" } });
	sendReady(proc);
	sendSpawned(proc);
	// Foreground processes only see this duplication after the shell has
	// finished initialization (i.e. when the OSC 133;A marker has fired).
	sendData(proc, SHELL_READY_MARKER);
}

describe("Session: query-response leak after shell-ready (#4013, #4041)", () => {
	it("drops DA1 response written by renderer after shell is ready", () => {
		const { session, proc } = createTestSession();
		spawnReadyAndMarkShellReady(session, proc);

		// delta runs `git diff`; xterm.js (renderer) replies to DA1 and the
		// reply is forwarded here. The headless emulator already replied —
		// this duplicate would otherwise leak into the shell prompt.
		session.write("\x1b[?62;4;9;22c");

		expect(getWrittenData(proc)).toEqual([]);
	});

	it("drops cursor-position report from renderer after shell is ready", () => {
		const { session, proc } = createTestSession();
		spawnReadyAndMarkShellReady(session, proc);

		session.write("\x1b[1;1R");

		expect(getWrittenData(proc)).toEqual([]);
	});

	it("drops OSC 11 background-color response from renderer", () => {
		const { session, proc } = createTestSession();
		spawnReadyAndMarkShellReady(session, proc);

		// The renderer's xterm has a theme and answers OSC 11 even though
		// the headless emulator does not. The reply still leaks because
		// delta exits before consuming it; the shell then reads it.
		session.write("\x1b]11;rgb:1515/1111/1010\x1b\\");

		expect(getWrittenData(proc)).toEqual([]);
	});

	it("drops concatenated OSC 11 + DA1 leak shape from #4041", () => {
		const { session, proc } = createTestSession();
		spawnReadyAndMarkShellReady(session, proc);

		// The exact leaked-text shape from the issue: OSC 11 reply followed
		// by DA1 reply, both emitted by the renderer for delta's startup
		// probe.
		session.write("\x1b]11;rgb:1515/1111/1010\x1b\\\x1b[?62;4;9;22c");

		expect(getWrittenData(proc)).toEqual([]);
	});

	it("still forwards genuine user input (arrow keys) after shell ready", () => {
		const { session, proc } = createTestSession();
		spawnReadyAndMarkShellReady(session, proc);

		session.write("\x1b[A");
		session.write("\x1b[B");

		expect(getWrittenData(proc)).toEqual(["\x1b[A", "\x1b[B"]);
	});

	it("still forwards plain text and Enter after shell ready", () => {
		const { session, proc } = createTestSession();
		spawnReadyAndMarkShellReady(session, proc);

		session.write("git diff\n");

		expect(getWrittenData(proc)).toEqual(["git diff\n"]);
	});

	it("strips response embedded in user input without dropping the rest", () => {
		const { session, proc } = createTestSession();
		spawnReadyAndMarkShellReady(session, proc);

		// Defensive: if a response is concatenated with real input, only the
		// response portion is dropped — the typed text reaches the PTY.
		session.write("ls\x1b[1;1R\n");

		expect(getWrittenData(proc)).toEqual(["ls\n"]);
	});
});
