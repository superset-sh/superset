import { beforeEach, describe, expect, it, mock } from "bun:test";
import type { ChildProcess } from "node:child_process";
import * as realChildProcess from "node:child_process";
import { EventEmitter } from "node:events";
import path from "node:path";
import "./xterm-env-polyfill";

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

let fakeChildProcess: FakeChildProcess;
let spawnCalls: Array<{ command: string; args: string[] }> = [];

mock.module("node:child_process", () => ({
	...realChildProcess,
	spawn: (command: string, args: string[]) => {
		spawnCalls.push({ command, args });
		return fakeChildProcess as unknown as ChildProcess;
	},
	default: {
		...realChildProcess,
		spawn: (command: string, args: string[]) => {
			spawnCalls.push({ command, args });
			return fakeChildProcess as unknown as ChildProcess;
		},
	},
}));

const { Session } = await import("./session");
const { BASH_DIR } = await import("../lib/agent-setup/paths");
const { createFrameHeader, PtySubprocessFrameDecoder, PtySubprocessIpcType } =
	await import("./pty-subprocess-ipc");

describe("Terminal Host Session shell args", () => {
	beforeEach(() => {
		fakeChildProcess = new FakeChildProcess();
		spawnCalls = [];
	});

	it("sends bash --rcfile args in spawn payload", () => {
		const session = new Session({
			sessionId: "session-bash-args",
			workspaceId: "workspace-1",
			paneId: "pane-1",
			tabId: "tab-1",
			cols: 80,
			rows: 24,
			cwd: "/tmp",
			shell: "/bin/bash",
		});

		session.spawn({
			cwd: "/tmp",
			cols: 80,
			rows: 24,
			env: { PATH: "/usr/bin" },
		});

		expect(spawnCalls.length).toBe(1);

		fakeChildProcess.stdout.emit(
			"data",
			createFrameHeader(PtySubprocessIpcType.Ready, 0),
		);

		const decoder = new PtySubprocessFrameDecoder();
		const frames = fakeChildProcess.stdin.writes.flatMap((chunk) =>
			decoder.push(chunk),
		);
		const spawnFrame = frames.find(
			(frame) => frame.type === PtySubprocessIpcType.Spawn,
		);

		expect(spawnFrame).toBeDefined();
		const spawnPayload = JSON.parse(
			spawnFrame?.payload.toString("utf8") ?? "{}",
		) as { args?: string[] } | undefined;

		expect(spawnPayload?.args).toEqual([
			"--rcfile",
			path.join(BASH_DIR, "rcfile"),
		]);
	});
});
