/**
 * Test: Session attach snapshot/broadcast overlap (Issue #3309)
 *
 * Proves that PTY data arriving during `session.attach()` is NOT
 * both broadcast to the newly-attached socket AND included in the
 * returned snapshot. Before the fix, the socket was added to
 * `attachedClients` *before* the snapshot was captured, so data
 * arriving in that window was duplicated: once in the snapshot and
 * once via the broadcast. The renderer would then write the data
 * twice to xterm, corrupting visible terminal state on reattach.
 */

import { beforeEach, describe, expect, it } from "bun:test";
import type { ChildProcess } from "node:child_process";
import { EventEmitter } from "node:events";
import { createFrameHeader, PtySubprocessIpcType } from "./pty-subprocess-ipc";
import "./xterm-env-polyfill";

const { Session } = await import("./session");

// ---------------------------------------------------------------------------
// Fakes
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

let fakeChildProcess: FakeChildProcess;

beforeEach(() => {
	fakeChildProcess = new FakeChildProcess();
});

describe("Session attach snapshot/broadcast overlap (#3309)", () => {
	it("does not broadcast PTY data to a socket whose attach snapshot is still in progress", async () => {
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

		// Write initial content before attach so the emulator has state.
		sendData(fakeChildProcess, "line-before-attach\r\n");

		// Drain the emulator write queue so the initial data is fully processed.
		await new Promise<void>((resolve) => setImmediate(resolve));
		await new Promise<void>((resolve) => setImmediate(resolve));

		// Intercept flushToSnapshotBoundary so we can inject PTY data
		// during the flush window (simulating continuous TUI output).
		let resolveBoundary!: (value: boolean) => void;
		const boundaryPromise = new Promise<boolean>((resolve) => {
			resolveBoundary = resolve;
		});
		(
			session as unknown as {
				flushToSnapshotBoundary: (_timeoutMs: number) => Promise<boolean>;
			}
		).flushToSnapshotBoundary = () => boundaryPromise;

		// Track all data written to the client socket (simulating the
		// renderer subscription that feeds handleStreamData / pendingEventsRef).
		const socketWrites: string[] = [];
		const socket = {
			write(message: string) {
				socketWrites.push(message);
				return true;
			},
		} as unknown as import("node:net").Socket;

		// Start the attach. The socket must NOT yet receive broadcasts
		// because its snapshot hasn't been captured.
		const attachPromise = session.attach(socket);
		await Promise.resolve();

		// Simulate PTY data arriving while attach is in progress.
		// Before the fix, this data would be broadcast to `socket`
		// AND end up in the snapshot → double-write on the renderer.
		sendData(fakeChildProcess, "data-during-attach\r\n");

		// The socket must NOT have received the in-flight data yet.
		const dataBroadcastsDuringAttach = socketWrites.filter((msg) =>
			msg.includes("data-during-attach"),
		);
		expect(dataBroadcastsDuringAttach).toHaveLength(0);

		// Now let the snapshot flush complete and finalize attach.
		resolveBoundary(true);
		const snapshot = await attachPromise;

		// The snapshot should contain the initial content that was there
		// before attach started.
		expect(snapshot.snapshotAnsi).toContain("line-before-attach");

		// After attach resolves, future broadcasts must reach the socket.
		sendData(fakeChildProcess, "data-after-attach\r\n");
		const postAttachBroadcasts = socketWrites.filter((msg) =>
			msg.includes("data-after-attach"),
		);
		expect(postAttachBroadcasts).toHaveLength(1);
	});

	it("cleans up the socket if attach is canceled before snapshot completes", async () => {
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

		// Hold the flush open so we can abort mid-attach.
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

		// Cancel while flush is in progress.
		controller.abort();

		await expect(attachPromise).rejects.toThrow();

		// The socket must not remain in the attached clients set.
		expect(session.clientCount).toBe(0);

		// Resolve boundary to prevent hanging.
		resolveBoundary(true);
	});
});
