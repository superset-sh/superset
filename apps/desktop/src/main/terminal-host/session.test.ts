import { beforeEach, describe, expect, it } from "bun:test";
import type { ChildProcess } from "node:child_process";
import { EventEmitter } from "node:events";
import type { Socket } from "node:net";
import path from "node:path";
import { DEFAULT_MODES } from "../lib/terminal-host/types";
import {
	createFrameHeader,
	PtySubprocessFrameDecoder,
	PtySubprocessIpcType,
} from "./pty-subprocess-ipc";
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

let fakeChildProcess: FakeChildProcess;
let spawnCalls: Array<{ command: string; args: string[] }> = [];

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
			spawnProcess: (command: string, args: readonly string[], _options) => {
				spawnCalls.push({ command, args: [...args] });
				return fakeChildProcess as unknown as ChildProcess;
			},
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
		) as { args?: string[] };

		expect(spawnPayload?.args?.[0]).toBe("--rcfile");
		expect(spawnPayload?.args?.[1]?.endsWith(path.join("bash", "rcfile"))).toBe(
			true,
		);
	});

	it("uses stream-first live attach without snapshot serialization", async () => {
		const session = new Session({
			sessionId: "session-live-attach",
			workspaceId: "workspace-1",
			paneId: "pane-1",
			tabId: "tab-1",
			cols: 80,
			rows: 24,
			cwd: "/tmp",
			shell: "/bin/bash",
			spawnProcess: (command: string, args: readonly string[], _options) => {
				spawnCalls.push({ command, args: [...args] });
				return fakeChildProcess as unknown as ChildProcess;
			},
		});

		let getSnapshotAsyncCalls = 0;
		const sessionAny = session as unknown as {
			emulator: {
				getDimensions: () => { cols: number; rows: number };
				getCwd: () => string | null;
				getModes: () => typeof DEFAULT_MODES;
				getScrollbackLines: () => number;
				getSnapshotAsync: () => Promise<unknown>;
			};
		};
		sessionAny.emulator = {
			getDimensions: () => ({ cols: 120, rows: 40 }),
			getCwd: () => "/tmp",
			getModes: () => ({ ...DEFAULT_MODES }),
			getScrollbackLines: () => 42,
			getSnapshotAsync: () => {
				getSnapshotAsyncCalls += 1;
				return Promise.resolve({});
			},
		};

		const snapshot = await session.attach({} as Socket, {
			includeSnapshot: false,
		});

		expect(getSnapshotAsyncCalls).toBe(0);
		expect(snapshot.snapshotAnsi).toBe("");
		expect(snapshot.rehydrateSequences).toBe("");
		expect(snapshot.cols).toBe(120);
		expect(snapshot.rows).toBe(40);
		expect(snapshot.scrollbackLines).toBe(42);
		expect(snapshot.modes.alternateScreen).toBe(false);
	});
});
