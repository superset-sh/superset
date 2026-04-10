import { beforeEach, describe, expect, it } from "bun:test";
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

function spawnAndReadySession(session: InstanceType<typeof Session>): void {
	session.spawn({
		cwd: "/tmp",
		cols: 80,
		rows: 24,
		env: { PATH: "/usr/bin" },
	});
	sendReady(fakeChildProcess);
	sendSpawned(fakeChildProcess);
}

let fakeChildProcess: FakeChildProcess;

beforeEach(() => {
	fakeChildProcess = new FakeChildProcess();
});

describe("Session attach snapshot/broadcast overlap", () => {
	it("does not stream in-flight attach data before the snapshot resolves", async () => {
		const session = new Session({
			sessionId: "session-overlap",
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
		sendData(fakeChildProcess, "line-before-attach\r\n");
		await new Promise<void>((resolve) => setImmediate(resolve));
		await new Promise<void>((resolve) => setImmediate(resolve));

		let resolveBoundary!: (value: boolean) => void;
		const boundaryPromise = new Promise<boolean>((resolve) => {
			resolveBoundary = resolve;
		});
		(
			session as unknown as {
				flushToSnapshotBoundary: (_timeoutMs: number) => Promise<boolean>;
			}
		).flushToSnapshotBoundary = () => boundaryPromise;

		const socketWrites: string[] = [];
		const socket = {
			write(message: string) {
				socketWrites.push(message);
				return true;
			},
		} as unknown as import("node:net").Socket;

		const attachPromise = session.attach(socket);
		await Promise.resolve();

		sendData(fakeChildProcess, "data-during-attach\r\n");

		const dataBroadcastsDuringAttach = socketWrites.filter((message) =>
			message.includes("data-during-attach"),
		);
		expect(dataBroadcastsDuringAttach).toHaveLength(0);

		resolveBoundary(true);
		const snapshot = await attachPromise;
		expect(snapshot.snapshotAnsi).toContain("line-before-attach");

		sendData(fakeChildProcess, "data-after-attach\r\n");
		const postAttachBroadcasts = socketWrites.filter((message) =>
			message.includes("data-after-attach"),
		);
		expect(postAttachBroadcasts).toHaveLength(1);
	});

	it("does not leak a canceled attach into attachedClients", async () => {
		const session = new Session({
			sessionId: "session-overlap-cancel",
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

		let resolveBoundary!: (value: boolean) => void;
		const boundaryPromise = new Promise<boolean>((resolve) => {
			resolveBoundary = resolve;
		});
		(
			session as unknown as {
				flushToSnapshotBoundary: (_timeoutMs: number) => Promise<boolean>;
			}
		).flushToSnapshotBoundary = () => boundaryPromise;

		const socket = {
			write() {
				return true;
			},
		} as unknown as import("node:net").Socket;

		const controller = new AbortController();
		const attachPromise = session.attach(socket, controller.signal);
		await Promise.resolve();

		controller.abort();
		await expect(attachPromise).rejects.toThrow();
		expect(session.clientCount).toBe(0);

		resolveBoundary(true);
	});
});
