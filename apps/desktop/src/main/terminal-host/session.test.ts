import { beforeEach, describe, expect, it } from "bun:test";
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
	pauseCalls = 0;
	resumeCalls = 0;

	pause(): this {
		this.pauseCalls++;
		return this;
	}

	resume(): this {
		this.resumeCalls++;
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

describe("Terminal Host Session emulator backlog backpressure", () => {
	beforeEach(() => {
		fakeChildProcess = new FakeChildProcess();
		spawnCalls = [];
	});

	it("pauses subprocess stdout when emulator backlog exceeds the watermark without attached clients", () => {
		const session = new Session({
			sessionId: "session-emulator-backpressure",
			workspaceId: "workspace-1",
			paneId: "pane-1",
			tabId: "tab-1",
			cols: 80,
			rows: 24,
			cwd: "/tmp",
			shell: "/bin/zsh",
			spawnProcess: () => fakeChildProcess as unknown as ChildProcess,
		});

		spawnAndReadySession(session);

		(
			session as unknown as {
				enqueueEmulatorWrite: (data: string) => void;
			}
		).enqueueEmulatorWrite("x".repeat(1_100_000));

		expect(fakeChildProcess.stdout.pauseCalls).toBe(1);
		expect(fakeChildProcess.stdout.resumeCalls).toBe(0);
	});

	it("resumes subprocess stdout once emulator backlog drains below the low watermark", () => {
		const session = new Session({
			sessionId: "session-emulator-resume",
			workspaceId: "workspace-1",
			paneId: "pane-1",
			tabId: "tab-1",
			cols: 80,
			rows: 24,
			cwd: "/tmp",
			shell: "/bin/zsh",
			spawnProcess: () => fakeChildProcess as unknown as ChildProcess,
		});

		spawnAndReadySession(session);

		const internals = session as unknown as {
			enqueueEmulatorWrite: (data: string) => void;
			emulatorWriteQueuedBytes: number;
			maybeResumeSubprocessStdoutForEmulatorBackpressure: () => void;
		};

		internals.enqueueEmulatorWrite("x".repeat(1_100_000));
		expect(fakeChildProcess.stdout.pauseCalls).toBe(1);

		internals.emulatorWriteQueuedBytes = 0;
		internals.maybeResumeSubprocessStdoutForEmulatorBackpressure();

		expect(fakeChildProcess.stdout.resumeCalls).toBe(1);
	});

	it("keeps queued byte accounting exact when chunking across a surrogate pair boundary", () => {
		const session = new Session({
			sessionId: "session-surrogate-pair-backpressure",
			workspaceId: "workspace-1",
			paneId: "pane-1",
			tabId: "tab-1",
			cols: 80,
			rows: 24,
			cwd: "/tmp",
			shell: "/bin/zsh",
			spawnProcess: () => fakeChildProcess as unknown as ChildProcess,
		});

		spawnAndReadySession(session);

		const internals = session as unknown as {
			enqueueEmulatorWrite: (data: string) => void;
			processEmulatorWriteQueue: () => void;
			emulatorWriteQueue: string[];
			emulatorWriteQueuedBytes: number;
		};

		internals.enqueueEmulatorWrite(`${"x".repeat(8191)}😀`);
		internals.processEmulatorWriteQueue();

		expect(internals.emulatorWriteQueue).toEqual([]);
		expect(internals.emulatorWriteQueuedBytes).toBe(0);
	});

	it("keeps subprocess stdout paused until client drain clears too", () => {
		const session = new Session({
			sessionId: "session-combined-backpressure",
			workspaceId: "workspace-1",
			paneId: "pane-1",
			tabId: "tab-1",
			cols: 80,
			rows: 24,
			cwd: "/tmp",
			shell: "/bin/zsh",
			spawnProcess: () => fakeChildProcess as unknown as ChildProcess,
		});

		spawnAndReadySession(session);

		const socket = new EventEmitter() as import("node:net").Socket;
		const internals = session as unknown as {
			enqueueEmulatorWrite: (data: string) => void;
			emulatorWriteQueuedBytes: number;
			handleClientBackpressure: (socket: import("node:net").Socket) => void;
			maybeResumeSubprocessStdoutForEmulatorBackpressure: () => void;
		};

		internals.enqueueEmulatorWrite("x".repeat(1_100_000));
		expect(fakeChildProcess.stdout.pauseCalls).toBe(1);

		internals.handleClientBackpressure(socket);
		internals.emulatorWriteQueuedBytes = 0;
		internals.maybeResumeSubprocessStdoutForEmulatorBackpressure();

		expect(fakeChildProcess.stdout.resumeCalls).toBe(0);

		socket.emit("drain");
		expect(fakeChildProcess.stdout.resumeCalls).toBe(1);
	});

	it("resumes subprocess stdout when a backpressured client disconnects before drain", () => {
		for (const eventName of ["close", "error"] as const) {
			fakeChildProcess = new FakeChildProcess();
			spawnCalls = [];

			const session = new Session({
				sessionId: `session-${eventName}-backpressure`,
				workspaceId: "workspace-1",
				paneId: "pane-1",
				tabId: "tab-1",
				cols: 80,
				rows: 24,
				cwd: "/tmp",
				shell: "/bin/zsh",
				spawnProcess: () => fakeChildProcess as unknown as ChildProcess,
			});

			spawnAndReadySession(session);

			const socket = new EventEmitter() as import("node:net").Socket;
			const internals = session as unknown as {
				enqueueEmulatorWrite: (data: string) => void;
				emulatorWriteQueuedBytes: number;
				handleClientBackpressure: (socket: import("node:net").Socket) => void;
				maybeResumeSubprocessStdoutForEmulatorBackpressure: () => void;
			};

			internals.enqueueEmulatorWrite("x".repeat(1_100_000));
			expect(fakeChildProcess.stdout.pauseCalls).toBe(1);

			internals.handleClientBackpressure(socket);
			internals.emulatorWriteQueuedBytes = 0;
			internals.maybeResumeSubprocessStdoutForEmulatorBackpressure();
			expect(fakeChildProcess.stdout.resumeCalls).toBe(0);

			if (eventName === "error") {
				socket.emit("error", new Error("socket closed"));
			} else {
				socket.emit("close");
			}

			socket.emit("drain");
			socket.emit("close");

			expect(fakeChildProcess.stdout.resumeCalls).toBe(1);
		}
	});

	it("resumes subprocess stdout when the last backpressured client throws during broadcast", () => {
		const session = new Session({
			sessionId: "session-dead-socket-backpressure",
			workspaceId: "workspace-1",
			paneId: "pane-1",
			tabId: "tab-1",
			cols: 80,
			rows: 24,
			cwd: "/tmp",
			shell: "/bin/zsh",
			spawnProcess: () => fakeChildProcess as unknown as ChildProcess,
		});

		spawnAndReadySession(session);

		const badSocket = new EventEmitter() as import("node:net").Socket & {
			write: (_message: string) => boolean;
		};
		badSocket.write = () => {
			throw new Error("socket closed");
		};

		const internals = session as unknown as {
			attachedClients: Map<
				import("node:net").Socket,
				{
					socket: import("node:net").Socket;
					attachedAt: number;
					attachToken: symbol;
				}
			>;
			handleClientBackpressure: (socket: import("node:net").Socket) => void;
			broadcastEvent: (
				eventType: string,
				payload: { type: "data"; data: string },
			) => void;
		};

		internals.attachedClients.set(badSocket, {
			socket: badSocket,
			attachedAt: Date.now(),
			attachToken: Symbol("attach"),
		});
		internals.handleClientBackpressure(badSocket);
		expect(fakeChildProcess.stdout.pauseCalls).toBe(1);

		internals.broadcastEvent("data", { type: "data", data: "hello" });

		expect(fakeChildProcess.stdout.resumeCalls).toBe(1);
	});
});

describe("Terminal Host Session UTF-8 chunk boundary", () => {
	beforeEach(() => {
		fakeChildProcess = new FakeChildProcess();
		spawnCalls = [];
	});

	function captureBroadcastDataEvents(session: InstanceType<typeof Session>) {
		const writes: string[] = [];
		const socket = {
			write(message: string) {
				writes.push(message);
				return true;
			},
		} as unknown as import("node:net").Socket;

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
		).attachedClients.set(socket, {
			socket,
			attachedAt: Date.now(),
			attachToken: Symbol("attach"),
		});

		return () =>
			writes
				.map((message) => {
					try {
						return JSON.parse(message.trim());
					} catch {
						return null;
					}
				})
				.filter(
					(event): event is { event: string; payload: { data: string } } =>
						event !== null && event.event === "data",
				)
				.map((event) => event.payload.data)
				.join("");
	}

	it("decodes a multi-byte UTF-8 character split across two Data frames", () => {
		const session = new Session({
			sessionId: "session-utf8-boundary-2byte",
			workspaceId: "workspace-1",
			paneId: "pane-1",
			tabId: "tab-1",
			cols: 80,
			rows: 24,
			cwd: "/tmp",
			// /bin/sh has no shell-ready marker, so PTY bytes go straight through
			// the scanner without holding back ASCII prefixes.
			shell: "/bin/sh",
			spawnProcess: () => fakeChildProcess as unknown as ChildProcess,
		});

		spawnAndReadySession(session);
		const getBroadcastData = captureBroadcastDataEvents(session);

		// "é" (U+00E9) encodes to 0xC3 0xA9 in UTF-8.
		// Split it across two Data frames — the PTY subprocess flushes on a
		// timer/size threshold and can land between bytes of one codepoint.
		sendFrame(fakeChildProcess, PtySubprocessIpcType.Data, Buffer.from([0xc3]));
		sendFrame(fakeChildProcess, PtySubprocessIpcType.Data, Buffer.from([0xa9]));

		const combined = getBroadcastData();
		expect(combined).toBe("é");
		expect(combined).not.toContain("�");
	});

	it("decodes a 4-byte UTF-8 emoji split across multiple Data frames", () => {
		const session = new Session({
			sessionId: "session-utf8-boundary-4byte",
			workspaceId: "workspace-1",
			paneId: "pane-1",
			tabId: "tab-1",
			cols: 80,
			rows: 24,
			cwd: "/tmp",
			shell: "/bin/sh",
			spawnProcess: () => fakeChildProcess as unknown as ChildProcess,
		});

		spawnAndReadySession(session);
		const getBroadcastData = captureBroadcastDataEvents(session);

		// "😀" (U+1F600) encodes to 0xF0 0x9F 0x98 0x80 in UTF-8.
		// Split across two Data frames at the worst possible spot (mid-codepoint).
		sendFrame(
			fakeChildProcess,
			PtySubprocessIpcType.Data,
			Buffer.from([0xf0, 0x9f]),
		);
		sendFrame(
			fakeChildProcess,
			PtySubprocessIpcType.Data,
			Buffer.from([0x98, 0x80]),
		);

		const combined = getBroadcastData();
		expect(combined).toBe("😀");
		expect(combined).not.toContain("�");
	});

	it("preserves surrounding ASCII when a multi-byte character spans a Data frame boundary", () => {
		const session = new Session({
			sessionId: "session-utf8-boundary-mixed",
			workspaceId: "workspace-1",
			paneId: "pane-1",
			tabId: "tab-1",
			cols: 80,
			rows: 24,
			cwd: "/tmp",
			shell: "/bin/sh",
			spawnProcess: () => fakeChildProcess as unknown as ChildProcess,
		});

		spawnAndReadySession(session);
		const getBroadcastData = captureBroadcastDataEvents(session);

		// "ab" + first half of "é" in frame 1, second half + "cd" in frame 2.
		sendFrame(
			fakeChildProcess,
			PtySubprocessIpcType.Data,
			Buffer.from([0x61, 0x62, 0xc3]),
		);
		sendFrame(
			fakeChildProcess,
			PtySubprocessIpcType.Data,
			Buffer.from([0xa9, 0x63, 0x64]),
		);

		const combined = getBroadcastData();
		expect(combined).toBe("abécd");
		expect(combined).not.toContain("�");
	});
});
