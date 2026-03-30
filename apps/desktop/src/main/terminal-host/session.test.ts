import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";
import type { ChildProcess } from "node:child_process";
import { EventEmitter } from "node:events";
import path from "node:path";
import { TERMINAL_ATTACH_CANCELED_MESSAGE } from "../lib/terminal/errors";
import {
	createFrameHeader,
	PtySubprocessFrameDecoder,
	PtySubprocessIpcType,
} from "./pty-subprocess-ipc";
import "./xterm-env-polyfill";

const { Session } = await import("./session");

class FakeStdout extends EventEmitter {
	pause() {
		return this;
	}
	resume() {
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

let fakeChildProcess: FakeChildProcess;
let spawnCalls: Array<{ command: string; args: string[] }> = [];

function getSpawnPayload(fakeChild: FakeChildProcess) {
	fakeChild.stdout.emit(
		"data",
		createFrameHeader(PtySubprocessIpcType.Ready, 0),
	);

	const decoder = new PtySubprocessFrameDecoder();
	const frames = fakeChild.stdin.writes.flatMap((chunk) => decoder.push(chunk));
	const spawnFrame = frames.find(
		(frame) => frame.type === PtySubprocessIpcType.Spawn,
	);
	expect(spawnFrame).toBeDefined();
	return JSON.parse(spawnFrame?.payload.toString("utf8") ?? "{}") as {
		args?: string[];
	};
}

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

		const spawnPayload = getSpawnPayload(fakeChildProcess);

		expect(spawnPayload?.args?.[0]).toBe("--rcfile");
		expect(spawnPayload?.args?.[1]?.endsWith(path.join("bash", "rcfile"))).toBe(
			true,
		);
	});

	it("uses -lc command args when command is provided", () => {
		const session = new Session({
			sessionId: "session-command-args",
			workspaceId: "workspace-1",
			paneId: "pane-1",
			tabId: "tab-1",
			cols: 80,
			rows: 24,
			cwd: "/tmp",
			shell: "/bin/bash",
			command: "echo hello && exit 1",
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

		const spawnPayload = getSpawnPayload(fakeChildProcess);

		// Should use -c style args (getCommandShellArgs), not --rcfile (getShellArgs)
		expect(spawnPayload?.args?.[0]).not.toBe("--rcfile");
		expect(spawnPayload?.args?.[0]).toMatch(/^-[l]?c$/);
		const argsStr = spawnPayload?.args?.join(" ") ?? "";
		expect(argsStr).toContain("echo hello && exit 1");
	});

	it("detaches and aborts attach when the signal is already canceled", async () => {
		const session = new Session({
			sessionId: "session-attach-canceled",
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

		const controller = new AbortController();
		controller.abort();

		await expect(
			session.attach(
				{} as unknown as import("node:net").Socket,
				controller.signal,
			),
		).rejects.toThrow(TERMINAL_ATTACH_CANCELED_MESSAGE);
		expect(session.clientCount).toBe(0);
	});

	it("keeps a replacement attach registered when an older attach is canceled", async () => {
		const session = new Session({
			sessionId: "session-replacement-attach",
			workspaceId: "workspace-1",
			paneId: "pane-1",
			tabId: "tab-1",
			cols: 80,
			rows: 24,
			cwd: "/tmp",
			shell: "/bin/bash",
		});

		let resolveBoundary!: (value: boolean) => void;
		const boundaryPromise = new Promise<boolean>((resolve) => {
			resolveBoundary = resolve;
		});
		(
			session as unknown as {
				flushToSnapshotBoundary: (_timeoutMs: number) => Promise<boolean>;
			}
		).flushToSnapshotBoundary = () => boundaryPromise;

		const writes: string[] = [];
		const socket = {
			write(message: string) {
				writes.push(message);
				return true;
			},
		} as unknown as import("node:net").Socket;

		const firstController = new AbortController();
		const firstAttach = session.attach(socket, firstController.signal);
		await Promise.resolve();

		const secondAttach = session.attach(socket);
		await Promise.resolve();

		firstController.abort();
		await expect(firstAttach).rejects.toThrow(TERMINAL_ATTACH_CANCELED_MESSAGE);
		expect(session.clientCount).toBe(1);

		resolveBoundary(true);
		await expect(secondAttach).resolves.toBeDefined();

		(
			session as unknown as {
				broadcastEvent: (
					eventType: string,
					payload: { type: "data"; data: string },
				) => void;
			}
		).broadcastEvent("data", { type: "data", data: "hello" });

		expect(writes.some((message) => message.includes('"hello"'))).toBe(true);
	});
});

// =============================================================================
// Backpressure tests (#2968 + #2961)
// =============================================================================

describe("Terminal Host Session backpressure", () => {
	let warnSpy: ReturnType<typeof mock>;
	let originalWarn: typeof console.warn;

	beforeEach(() => {
		originalWarn = console.warn;
		warnSpy = mock();
		console.warn = warnSpy;
	});

	afterEach(() => {
		console.warn = originalWarn;
	});

	class FakeSocket extends EventEmitter {
		readonly writes: string[] = [];
		remoteAddress = "127.0.0.1";
		remotePort = 9999;
		private writeFn: (message: string) => boolean;

		constructor(writeFn: (message: string, writes: string[]) => boolean) {
			super();
			this.writeFn = (msg) => writeFn(msg, this.writes);
		}

		write(message: string): boolean {
			this.writes.push(message);
			return this.writeFn(message);
		}

		destroy() {}
	}

	function createSessionWithSocket(
		writeFn: (message: string, writes: string[]) => boolean,
	) {
		type BroadcastPayload =
			| { type: "data"; data: string }
			| { type: "error"; error: string; code?: string }
			| { type: "exit"; exitCode: number; signal?: number };

		const child = new FakeChildProcess();
		const session = new Session({
			sessionId: "session-bp",
			workspaceId: "workspace-1",
			paneId: "pane-1",
			tabId: "tab-1",
			cols: 80,
			rows: 24,
			cwd: "/tmp",
			shell: "/bin/bash",
			spawnProcess: () => child as unknown as ChildProcess,
		});

		session.spawn({
			cwd: "/tmp",
			cols: 80,
			rows: 24,
			env: { PATH: "/usr/bin" },
		});

		// Emit Ready so we can attach
		child.stdout.emit("data", createFrameHeader(PtySubprocessIpcType.Ready, 0));

		const fakeSocket = new FakeSocket(
			writeFn,
		) as unknown as import("node:net").Socket;

		// Directly inject the socket as an attached client
		(
			session as unknown as {
				attachedClients: Map<
					import("node:net").Socket,
					{
						socket: import("node:net").Socket;
						attachedAt: number;
						attachToken: symbol;
					}
				>;
			}
		).attachedClients.set(fakeSocket, {
			socket: fakeSocket,
			attachedAt: Date.now(),
			attachToken: Symbol("test-attach"),
		});

		const broadcastEvent = (
			eventType: BroadcastPayload["type"],
			payload: BroadcastPayload,
		) => {
			(
				session as unknown as {
					broadcastEvent: (
						eventType: string,
						payload: BroadcastPayload,
					) => void;
				}
			).broadcastEvent(eventType, payload);
		};

		const broadcast = (data: string) => {
			broadcastEvent("data", { type: "data", data });
		};

		return { session, socket: fakeSocket, broadcast, broadcastEvent };
	}

	it("stops writing to a backpressured socket instead of growing the buffer", () => {
		// First write succeeds, subsequent ones signal backpressure
		const { socket, broadcast } = createSessionWithSocket(
			(_msg, writes) => writes.length <= 1,
		);
		const fakeSocket = socket as unknown as FakeSocket;

		// First broadcast: write succeeds
		broadcast("frame-1");
		expect(fakeSocket.writes).toHaveLength(1);

		// Second broadcast: write returns false → socket becomes backpressured
		broadcast("frame-2");
		expect(fakeSocket.writes).toHaveLength(2);

		// Subsequent broadcasts should be SKIPPED — not written to the socket
		broadcast("frame-3");
		broadcast("frame-4");
		broadcast("frame-5");
		expect(fakeSocket.writes).toHaveLength(2);
	});

	it("resumes writing after the socket drains", () => {
		// First write succeeds, second backpressures, after drain writes succeed again
		const { socket, broadcast } = createSessionWithSocket(
			(_msg, writes) => writes.length !== 2,
		);
		const fakeSocket = socket as unknown as FakeSocket;

		broadcast("frame-1"); // write #1 → succeeds (length 1 !== 2)
		broadcast("frame-2"); // write #2 → returns false (length 2 === 2)

		// Skipped during backpressure
		broadcast("frame-3");
		broadcast("frame-4");
		expect(fakeSocket.writes).toHaveLength(2);

		// Simulate drain — triggers the once("drain") handler which removes
		// the socket from clientSocketsWaitingForDrain
		fakeSocket.emit("drain");

		// After drain, new broadcasts write again (write #3 → succeeds)
		broadcast("frame-5");
		expect(fakeSocket.writes).toHaveLength(3);
		expect(fakeSocket.writes[2]).toContain("frame-5");
	});

	it("still delivers exit and error events while socket is waiting for drain", () => {
		const { socket, broadcast, broadcastEvent } = createSessionWithSocket(
			(_msg, writes) => writes.length <= 1,
		);
		const fakeSocket = socket as unknown as FakeSocket;

		broadcast("frame-1");
		broadcast("frame-2");
		expect(fakeSocket.writes).toHaveLength(2);

		broadcastEvent("exit", { type: "exit", exitCode: 0 });
		broadcastEvent("error", { type: "error", error: "boom" });

		expect(fakeSocket.writes).toHaveLength(4);
		expect(fakeSocket.writes[2]).toContain('"event":"exit"');
		expect(fakeSocket.writes[2]).toContain('"exitCode":0');
		expect(fakeSocket.writes[3]).toContain('"event":"error"');
		expect(fakeSocket.writes[3]).toContain('"error":"boom"');
	});

	it("emits only one backpressure warning while socket remains backpressured", () => {
		const { broadcast } = createSessionWithSocket(() => false);

		for (let i = 0; i < 1000; i++) {
			broadcast(`chunk-${i}`);
		}

		const backpressureWarns = (warnSpy.mock.calls as unknown[][]).filter(
			(call) =>
				typeof call[0] === "string" &&
				call[0].includes("Client socket buffer full"),
		);

		// Should emit exactly 1 warning, not 1000
		expect(backpressureWarns.length).toBe(1);
	});

	it("includes suppressed count when warning resumes after interval", () => {
		// Write always returns false so every non-skipped write triggers backpressure.
		// We need to drain between writes to avoid the skip-backpressured-socket optimization.
		const { session, socket, broadcast } = createSessionWithSocket(() => false);
		const fakeSocket = socket as unknown as FakeSocket;

		// First broadcast: writes, gets backpressured, warns immediately
		broadcast("first");

		// Drain + re-broadcast many times within the rate-limit window to
		// accumulate suppressed warnings
		for (let i = 0; i < 50; i++) {
			fakeSocket.emit("drain");
			broadcast(`suppressed-${i}`);
		}

		// Advance past the rate-limit window
		(
			session as unknown as { backpressureWarnLastAt: number }
		).backpressureWarnLastAt = Date.now() - 10_000;

		// Drain once more, then broadcast — should emit with suppressed count
		fakeSocket.emit("drain");
		broadcast("after-interval");

		const backpressureWarns = (warnSpy.mock.calls as unknown[][]).filter(
			(call) =>
				typeof call[0] === "string" &&
				call[0].includes("Client socket buffer full"),
		);

		expect(backpressureWarns.length).toBe(2);
		const lastWarn = backpressureWarns[1]?.[0] as string;
		expect(lastWarn).toContain("suppressed");
		expect(lastWarn).toContain("50");
	});
});
