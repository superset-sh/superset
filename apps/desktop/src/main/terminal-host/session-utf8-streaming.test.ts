import { describe, expect, it } from "bun:test";
import type { ChildProcess } from "node:child_process";
import { EventEmitter } from "node:events";
import { createFrameHeader, PtySubprocessIpcType } from "./pty-subprocess-ipc";
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

class FakeStdin extends EventEmitter {
	write(_chunk: Buffer | string): boolean {
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

function newSpawnedSession(
	fakeChildProcess: FakeChildProcess,
): InstanceType<typeof Session> {
	const session = new Session({
		sessionId: "session-utf8",
		workspaceId: "workspace-1",
		paneId: "pane-1",
		tabId: "tab-1",
		cols: 80,
		rows: 24,
		cwd: "/tmp",
		// /bin/sh has no shell-ready marker, so the OSC 133 scanner stays off
		// and incoming bytes pass straight through to the decoder.
		shell: "/bin/sh",
		spawnProcess: () => fakeChildProcess as unknown as ChildProcess,
	});
	session.spawn({
		cwd: "/tmp",
		cols: 80,
		rows: 24,
		env: { PATH: "/usr/bin" },
	});
	sendFrame(fakeChildProcess, PtySubprocessIpcType.Ready);
	const pidBuf = Buffer.allocUnsafe(4);
	pidBuf.writeUInt32LE(1234, 0);
	sendFrame(fakeChildProcess, PtySubprocessIpcType.Spawned, pidBuf);
	return session;
}

function captureStreamedData(session: InstanceType<typeof Session>): string[] {
	const captured: string[] = [];
	const internals = session as unknown as {
		enqueueEmulatorWrite: (data: string) => void;
	};
	internals.enqueueEmulatorWrite = (data: string) => {
		captured.push(data);
	};
	return captured;
}

describe("Session UTF-8 streaming across chunk boundaries", () => {
	it("decodes a 3-byte UTF-8 codepoint split across two PTY chunks without producing replacement chars", () => {
		const fakeChildProcess = new FakeChildProcess();
		const session = newSpawnedSession(fakeChildProcess);
		const captured = captureStreamedData(session);

		// "한" (U+D55C) encodes as 3 UTF-8 bytes: 0xED 0x95 0x9C.
		// Real PTYs frequently split multi-byte codepoints across read() chunks
		// when streaming output from CLIs like Claude Code.
		sendFrame(
			fakeChildProcess,
			PtySubprocessIpcType.Data,
			Buffer.from([0xed, 0x95]),
		);
		sendFrame(fakeChildProcess, PtySubprocessIpcType.Data, Buffer.from([0x9c]));

		const combined = captured.join("");
		expect(combined).not.toContain("�");
		expect(combined).toBe("한");
	});

	it("decodes a 4-byte emoji split across two PTY chunks without producing replacement chars", () => {
		const fakeChildProcess = new FakeChildProcess();
		const session = newSpawnedSession(fakeChildProcess);
		const captured = captureStreamedData(session);

		// "😀" (U+1F600) encodes as 4 UTF-8 bytes: 0xF0 0x9F 0x98 0x80.
		sendFrame(
			fakeChildProcess,
			PtySubprocessIpcType.Data,
			Buffer.from([0xf0, 0x9f, 0x98]),
		);
		sendFrame(fakeChildProcess, PtySubprocessIpcType.Data, Buffer.from([0x80]));

		const combined = captured.join("");
		expect(combined).not.toContain("�");
		expect(combined).toBe("😀");
	});

	it("decodes a long UTF-8 stream split into 1-byte chunks without losing or corrupting any codepoint", () => {
		const fakeChildProcess = new FakeChildProcess();
		const session = newSpawnedSession(fakeChildProcess);
		const captured = captureStreamedData(session);

		// Mix ASCII, 2-byte (é), 3-byte (한), and 4-byte (😀) codepoints.
		const original = "hello é 한 😀 world";
		const bytes = Buffer.from(original, "utf8");

		// Worst-case streaming: every byte arrives as its own frame.
		for (const byte of bytes) {
			sendFrame(
				fakeChildProcess,
				PtySubprocessIpcType.Data,
				Buffer.from([byte]),
			);
		}

		const combined = captured.join("");
		expect(combined).not.toContain("�");
		expect(combined).toBe(original);
	});
});
