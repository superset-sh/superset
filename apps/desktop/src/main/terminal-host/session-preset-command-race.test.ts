/**
 * Reproduction for #5712 — "Setup/Preset commands drop the first char".
 *
 * When a workspace spins up, the app injects the configured setup command (and
 * later, preset commands) into the terminal. Users report the FIRST character
 * of that command is silently dropped:
 *
 *   ./setup-worktree.sh   ->  /setup-worktree.sh   (leading "." eaten)
 *   claude --permission…  ->  laude --permission…  (leading "c" eaten)
 *
 * Root cause: `Session.write()` forwards a programmatically-injected command to
 * the PTY *immediately*, even while the shell is still running its init files
 * (`shellReadyState === "pending"`, i.e. before the OSC 133;A ready marker).
 * If that init opens an interactive prompt that reads a single byte — e.g.
 * oh-my-zsh's "[oh-my-zsh] Would you like to update? [Y/n]" — the command's
 * first byte answers that prompt and is consumed, so only the remainder is left
 * on the command line.
 *
 * The desired behavior is that an app-injected startup command is only
 * delivered to the PTY once the shell has signalled it is ready for input
 * (the shell-ready marker), so no init-time prompt can swallow its first char.
 *
 * NOTE: this races only for programmatic command injection. User keystrokes
 * must still pass through during `pending` so they can answer init prompts
 * (#3478); this test does not assert against that behavior.
 */
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

/** Decode all Write frames the session forwarded to the subprocess stdin. */
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
	session.spawn({ cwd: "/tmp", cols: 80, rows: 24, env: { PATH: "/usr/bin" } });
	sendReady(proc);
	sendSpawned(proc);
}

/**
 * Model an interactive shell-init prompt (e.g. oh-my-zsh's "[Y/n]" update
 * prompt) that reads exactly one byte from stdin. Whatever byte arrives first
 * during init answers the prompt and never reaches the command line.
 */
function applyInitPromptConsumingOneByte(bytesReceivedByShell: string): string {
	return bytesReceivedByShell.slice(1);
}

describe("Session preset-command race (#5712)", () => {
	// Marked `it.failing`: this asserts the DESIRED post-fix behavior, so it
	// currently fails (documenting the bug) while keeping CI green. Once the
	// race is fixed it will start passing and this `.failing` marker must be
	// removed.
	it.failing("does not forward an injected startup command to the PTY while the shell is still initializing", () => {
		const { session, proc } = createTestSession("/bin/zsh");
		spawnAndReady(session, proc);

		// The shell is still running its init files (oh-my-zsh, etc.) and
		// has NOT emitted the ready marker yet. The app injects the setup
		// command now, as it does today on session-created.
		session.write("./setup-worktree.sh\n");

		// Desired: nothing reaches the PTY until the shell is ready, so an
		// init-time prompt cannot eat the command's first byte.
		// Actual (bug): the command is forwarded immediately during
		// `pending`, which is why this assertion fails today.
		expect(getWrittenData(proc)).toEqual([]);

		// After the shell signals readiness, the command should be
		// delivered intact.
		sendData(proc, `${SHELL_READY_MARKER}➜ `);
		expect(getWrittenData(proc)).toEqual(["./setup-worktree.sh\n"]);
	});

	it("demonstrates the first-char drop when init prompt consumes the early command byte", () => {
		const { session, proc } = createTestSession("/bin/zsh");
		spawnAndReady(session, proc);

		// oh-my-zsh prints "Would you like to update? [Y/n]" and blocks on a
		// single-byte read while the shell is still `pending`.
		session.write("claude --permission-mode plan\n");

		// The command was forwarded during init, so the shell receives it while
		// the prompt is reading — the first byte answers the prompt.
		const receivedByShell = getWrittenData(proc).join("");
		const effectiveCommand = applyInitPromptConsumingOneByte(receivedByShell);

		// This is exactly the corruption users report: "laude …" not found.
		expect(effectiveCommand).toBe("laude --permission-mode plan\n");
	});
});
