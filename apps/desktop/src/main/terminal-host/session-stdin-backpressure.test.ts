import { beforeEach, describe, expect, it } from "bun:test";
import type { ChildProcess } from "node:child_process";
import { EventEmitter } from "node:events";
import {
	createFrameHeader,
	PtySubprocessFrameDecoder,
	PtySubprocessIpcType,
} from "./pty-subprocess-ipc";
import "./xterm-env-polyfill";

const { Session } = await import("./session");

class FakeStdout extends EventEmitter {
	pause(): this {
		return this;
	}
	resume(): this {
		return this;
	}
}

/**
 * stdin fake that can simulate Node stream backpressure: `armBackpressureOnce`
 * makes the *next* `write()` return `false` (as a real stream does when its
 * internal buffer exceeds highWaterMark) while still ACCEPTING the bytes, then
 * asynchronously emits `drain`. This mirrors real streams: a `false` return is
 * advisory — the chunk is already buffered and must not be resent.
 */
class BackpressureStdin extends EventEmitter {
	readonly writes: Buffer[] = [];
	private nextWriteBackpressures = false;

	armBackpressureOnce(): void {
		this.nextWriteBackpressures = true;
	}

	write(chunk: Buffer | string): boolean {
		this.writes.push(
			Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk, "utf8"),
		);
		if (this.nextWriteBackpressures) {
			this.nextWriteBackpressures = false;
			setImmediate(() => this.emit("drain"));
			return false;
		}
		return true;
	}
}

class FakeChildProcess extends EventEmitter {
	readonly stdout = new FakeStdout();
	readonly stdin = new BackpressureStdin();
	pid = 4242;
	kill(): boolean {
		return true;
	}
}

let fakeChildProcess: FakeChildProcess;

function sendFrame(
	proc: FakeChildProcess,
	type: PtySubprocessIpcType,
	payload?: Buffer,
): void {
	const buf = payload ?? Buffer.alloc(0);
	const header = createFrameHeader(type, buf.length);
	proc.stdout.emit("data", Buffer.concat([header, buf]));
}

function spawnAndReadySession(session: InstanceType<typeof Session>): void {
	session.spawn({ cwd: "/tmp", cols: 80, rows: 24, env: { PATH: "/usr/bin" } });
	sendFrame(fakeChildProcess, PtySubprocessIpcType.Ready);
	const pidBuf = Buffer.allocUnsafe(4);
	pidBuf.writeUInt32LE(1234, 0);
	sendFrame(fakeChildProcess, PtySubprocessIpcType.Spawned, pidBuf);
}

/** Decode everything written to stdin and reconstruct concatenated Write payloads. */
function decodeWrittenText(writes: Buffer[]): string {
	const decoder = new PtySubprocessFrameDecoder();
	const parts: Buffer[] = [];
	for (const chunk of writes) {
		for (const frame of decoder.push(chunk)) {
			if (frame.type === PtySubprocessIpcType.Write) {
				parts.push(frame.payload);
			}
		}
	}
	return Buffer.concat(parts).toString("utf8");
}

describe("Terminal Host Session stdin backpressure (issue #5569)", () => {
	beforeEach(() => {
		fakeChildProcess = new FakeChildProcess();
	});

	it("does not corrupt the frame stream when stdin backpressures mid-paste", () => {
		const session = new Session({
			sessionId: "session-backpressure",
			workspaceId: "workspace-1",
			paneId: "pane-1",
			tabId: "tab-1",
			cols: 80,
			rows: 24,
			cwd: "/tmp",
			shell: "/bin/bash",
			spawnProcess: () => fakeChildProcess as unknown as ChildProcess,
		});

		spawnAndReadySession(session);

		// Drop the spawn frame; we only care about the paste that follows.
		fakeChildProcess.stdin.writes.length = 0;

		// A realistic "750 lines of logs" paste — enough to span several
		// internal 8192-char chunks so backpressure lands mid-stream.
		const paste = `${Array.from(
			{ length: 750 },
			(_, i) => `2026-07-10T12:00:00Z log line ${i} some payload text here`,
		).join("\n")}\n`;

		// The very next stdin write hits backpressure, exactly like a real
		// stream buffering a large paste.
		fakeChildProcess.stdin.armBackpressureOnce();

		session.write(paste);

		// Reconstructing the frames must yield the original paste byte-for-byte.
		// With the resend-on-backpressure bug, a header buffer is written twice,
		// which desynchronizes the length-prefixed stream and surfaces as
		// "IPC frame too large" in the subprocess.
		expect(decodeWrittenText(fakeChildProcess.stdin.writes)).toBe(paste);
	});
});
