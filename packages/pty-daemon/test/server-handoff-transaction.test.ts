import { afterEach, describe, expect, test } from "bun:test";
import type * as childProcess from "node:child_process";
import { EventEmitter } from "node:events";
import * as os from "node:os";
import * as path from "node:path";
import type { Pty, PtyOnData, PtyOnExit } from "../src/Pty/index.ts";
import type { ServerMessage, SessionMeta } from "../src/protocol/index.ts";
import { Server } from "../src/Server/Server.ts";
import {
	type HandoffSnapshot,
	SNAPSHOT_VERSION,
} from "../src/SessionStore/index.ts";
import {
	connectAndHello,
	type DaemonClient,
	payloadAsString,
} from "./helpers/client.ts";

type HandoffResult =
	| { ok: true; successorPid: number }
	| { ok: false; reason: string };

interface Deferred<T> {
	promise: Promise<T>;
	resolve(value: T): void;
	reject(error: unknown): void;
}

function deferred<T>(): Deferred<T> {
	let resolve!: (value: T) => void;
	let reject!: (error: unknown) => void;
	const promise = new Promise<T>((res, rej) => {
		resolve = res;
		reject = rej;
	});
	return { promise, resolve, reject };
}

interface FakePtyState {
	meta: SessionMeta;
	writes: Buffer[];
	prepareCalls: number;
	restoreCalls: number;
	cancelCalls: number;
	resizeCalls: number;
	killCalls: number;
	sealCalls: number;
	frozen: boolean;
}

interface HandoffHarness {
	server: Server;
	client: DaemonClient;
	state: FakePtyState;
	drain: Deferred<void>;
	prepareStarted: Deferred<void>;
	ack: Deferred<HandoffResult>;
	counters: {
		ptySpawns: number;
		successorSpawns: number;
		terminateCalls: number;
	};
	afterAckHook: { current: (() => void) | null };
	cleanup(): Promise<void>;
}

const liveHarnesses: HandoffHarness[] = [];

afterEach(async () => {
	await Promise.all(
		liveHarnesses.splice(0).map((harness) => harness.cleanup()),
	);
});

async function makeHandoffHarness(
	options: { killConfirmed?: boolean; listeningResult?: HandoffResult } = {},
): Promise<HandoffHarness> {
	const socketPath = path.join(
		os.tmpdir(),
		`pty-daemon-server-handoff-${process.pid}-${Math.random().toString(36).slice(2)}.sock`,
	);
	const drain = deferred<void>();
	const prepareStarted = deferred<void>();
	const ack = deferred<HandoffResult>();
	const counters = { ptySpawns: 0, successorSpawns: 0, terminateCalls: 0 };
	const afterAckHook: { current: (() => void) | null } = { current: null };
	const state: FakePtyState = {
		meta: { shell: "/bin/sh", argv: [], cols: 80, rows: 24 },
		writes: [],
		prepareCalls: 0,
		restoreCalls: 0,
		cancelCalls: 0,
		resizeCalls: 0,
		killCalls: 0,
		sealCalls: 0,
		frozen: false,
	};
	const fakeChild = new EventEmitter() as childProcess.ChildProcess;
	Object.assign(fakeChild, {
		pid: 91_001,
		exitCode: null,
		signalCode: null,
		kill: () => true,
	});

	const server = new Server({
		socketPath,
		daemonVersion: "test-handoff",
		spawnPty: ({ meta }) => {
			counters.ptySpawns += 1;
			state.meta = { ...meta };
			const pty: Pty = {
				pid: 81_001,
				meta: state.meta,
				write(data) {
					if (state.frozen) throw new Error("fake PTY input is frozen");
					state.writes.push(Buffer.from(data));
				},
				resize(cols, rows) {
					state.resizeCalls += 1;
					state.meta = { ...state.meta, cols, rows };
				},
				kill() {
					state.killCalls += 1;
				},
				onData() {},
				onExit() {},
				async prepareForHandoff() {
					state.frozen = true;
					state.prepareCalls += 1;
					prepareStarted.resolve();
					await drain.promise;
				},
				pauseOutputForHandoff() {},
				drainOutputForHandoff: async () => [],
				sealOutputForHandoff: async () => {
					state.sealCalls += 1;
					return [];
				},
				restoreAfterFailedHandoff() {
					state.restoreCalls += 1;
				},
				cancelHandoff() {
					state.cancelCalls += 1;
					state.frozen = false;
				},
				getMasterFd: () => 42,
			};
			return pty;
		},
		handoffRuntime: {
			spawnSuccessor: () => {
				counters.successorSpawns += 1;
				return fakeChild;
			},
			waitForReady: async () => {
				const result = await ack.promise;
				afterAckHook.current?.();
				return result;
			},
			commitAndWaitForListening: async (_child, successorPid) =>
				options.listeningResult ?? { ok: true, successorPid },
			terminateAndConfirm: async () => {
				counters.terminateCalls += 1;
				return options.killConfirmed ?? true;
			},
		},
	});
	await server.listen();
	const client = await connectAndHello(socketPath);
	client.send({ type: "open", id: "live", meta: state.meta });
	await client.waitFor((message) => message.type === "open-ok");

	let cleaned = false;
	const harness: HandoffHarness = {
		server,
		client,
		state,
		drain,
		prepareStarted,
		ack,
		counters,
		afterAckHook,
		async cleanup() {
			if (cleaned) return;
			cleaned = true;
			drain.resolve();
			ack.resolve({ ok: false, reason: "test cleanup" });
			await client.close();
			await server.close();
		},
	};
	liveHarnesses.push(harness);
	return harness;
}

async function expectUpgradeError(
	client: DaemonClient,
	message: unknown,
	payload?: Uint8Array,
): Promise<ServerMessage> {
	const reply = client.waitForNext(
		(candidate) =>
			candidate.type === "error" && candidate.code === "EUPGRADING",
		1_000,
	);
	client.send(message, payload);
	return await reply;
}

async function waitUntil(
	predicate: () => boolean,
	timeoutMs = 1_000,
): Promise<void> {
	const deadline = Date.now() + timeoutMs;
	while (!predicate()) {
		if (Date.now() >= deadline) throw new Error("condition timed out");
		await new Promise((resolve) => setTimeout(resolve, 2));
	}
}

describe("Server handoff transaction", () => {
	test("mutations while draining are rejected, not applied, and abort before spawn", async () => {
		const harness = await makeHandoffHarness();
		const preparing = harness.server.prepareUpgrade();
		await harness.prepareStarted.promise;

		await expectUpgradeError(
			harness.client,
			{ type: "input", id: "live" },
			Buffer.from("must-not-write"),
		);
		await expectUpgradeError(harness.client, {
			type: "resize",
			id: "live",
			cols: 120,
			rows: 40,
		});
		await expectUpgradeError(harness.client, {
			type: "close",
			id: "live",
			signal: "SIGKILL",
		});
		await expectUpgradeError(harness.client, {
			type: "open",
			id: "new",
			meta: { ...harness.state.meta },
		});

		expect(harness.state.writes).toHaveLength(0);
		expect(harness.state.resizeCalls).toBe(0);
		expect(harness.state.killCalls).toBe(0);
		expect(harness.counters.ptySpawns).toBe(1);

		harness.drain.resolve();
		const result = await preparing;
		expect(result.ok).toBe(false);
		if (!result.ok) expect(result.reason).toMatch(/mutation.*draining/);
		expect(harness.counters.successorSpawns).toBe(0);
		expect(harness.state.restoreCalls).toBe(1);
		expect(harness.state.cancelCalls).toBe(1);
		expect(harness.state.frozen).toBe(false);

		harness.client.send(
			{ type: "input", id: "live" },
			Buffer.from("accepted-after-abort"),
		);
		const barrier = harness.client.waitForNext(
			(message) => message.type === "list-reply",
		);
		harness.client.send({ type: "list" });
		await barrier;
		expect(harness.state.writes.map((chunk) => chunk.toString())).toEqual([
			"accepted-after-abort",
		]);
	});

	test("a second prepare is busy while the first prepare owns the phase", async () => {
		const harness = await makeHandoffHarness();
		const first = harness.server.prepareUpgrade();
		await harness.prepareStarted.promise;
		const second = await harness.server.prepareUpgrade();
		expect(second).toEqual({
			ok: false,
			reason: "upgrade already preparing",
			ownership: "unresolved",
		});

		await expectUpgradeError(
			harness.client,
			{ type: "input", id: "live" },
			Buffer.from("abort-first"),
		);
		harness.drain.resolve();
		expect((await first).ok).toBe(false);
		expect(harness.counters.successorSpawns).toBe(0);
	});

	test("a mutation observed after child ACK aborts before commit and is not applied", async () => {
		const harness = await makeHandoffHarness();
		harness.drain.resolve();
		const sent: ServerMessage[] = [];
		harness.afterAckHook.current = () => {
			const fakeConn = {
				negotiated: 2,
				subscriptions: new Set<string>(),
				send(message: ServerMessage) {
					sent.push(message);
				},
			};
			(
				harness.server as unknown as {
					dispatch(
						conn: unknown,
						message: unknown,
						payload: Uint8Array | null,
					): void;
				}
			).dispatch(
				fakeConn,
				{ type: "resize", id: "live", cols: 140, rows: 50 },
				null,
			);
		};

		const preparing = harness.server.prepareUpgrade();
		await waitUntil(() => harness.counters.successorSpawns === 1);
		harness.ack.resolve({ ok: true, successorPid: 91_001 });
		const result = await preparing;

		expect(result.ok).toBe(false);
		if (!result.ok) expect(result.reason).toMatch(/mutation.*before commit/);
		expect(sent).toEqual([
			expect.objectContaining({ type: "error", code: "EUPGRADING" }),
		]);
		expect(harness.state.resizeCalls).toBe(0);
		expect(harness.counters.terminateCalls).toBe(1);
		expect(harness.state.restoreCalls).toBe(1);
		expect(harness.state.cancelCalls).toBe(1);
	});

	test("unconfirmed successor death leaves predecessor frozen and fail closed", async () => {
		const harness = await makeHandoffHarness({ killConfirmed: false });
		harness.drain.resolve();
		const preparing = harness.server.prepareUpgrade();
		await waitUntil(() => harness.counters.successorSpawns === 1);
		harness.ack.resolve({ ok: false, reason: "successor rejected snapshot" });
		const result = await preparing;

		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.reason).toMatch(/remains frozen/);
			expect(result.ownership).toBe("unresolved");
		}
		// Ownership is unresolved, so even touching the inherited fd is unsafe.
		// The predecessor must keep both its reader and input fail-closed.
		expect(harness.state.restoreCalls).toBe(0);
		expect(harness.state.cancelCalls).toBe(0);
		expect(harness.state.frozen).toBe(true);
		await expectUpgradeError(
			harness.client,
			{ type: "input", id: "live" },
			Buffer.from("must-remain-rejected"),
		);
		expect(harness.state.writes).toHaveLength(0);
		expect(await harness.server.prepareUpgrade()).toEqual({
			ok: false,
			reason: "upgrade already preparing",
			ownership: "unresolved",
		});
	});

	test("failure after seal and COMMIT keeps predecessor fail closed", async () => {
		const harness = await makeHandoffHarness({
			listeningResult: {
				ok: false,
				reason: "successor lost IPC before LISTENING",
			},
		});
		harness.drain.resolve();
		const preparing = harness.server.prepareUpgrade();
		await waitUntil(() => harness.counters.successorSpawns === 1);
		harness.ack.resolve({ ok: true, successorPid: 91_001 });
		const result = await preparing;

		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.reason).toMatch(
				/after commit is unresolved|after commit.*unresolved/i,
			);
			expect(result.ownership).toBe("unresolved");
		}
		expect(harness.state.sealCalls).toBe(1);
		expect(harness.state.restoreCalls).toBe(0);
		expect(harness.state.cancelCalls).toBe(0);
		expect(harness.state.frozen).toBe(true);
		await expectUpgradeError(
			harness.client,
			{ type: "input", id: "live" },
			Buffer.from("must-remain-rejected-after-commit"),
		);
		expect(harness.state.writes).toHaveLength(0);
		expect(await harness.server.prepareUpgrade()).toEqual({
			ok: false,
			reason: "upgrade already committing",
			ownership: "unresolved",
		});
	});
});

describe("staged successor output", () => {
	for (const replay of [false, true] as const) {
		test(`subscribe replay=${replay} activates queued live output without a gap`, async () => {
			const socketPath = path.join(
				os.tmpdir(),
				`pty-daemon-staged-${process.pid}-${Math.random().toString(36).slice(2)}.sock`,
			);
			const pending: Buffer[] = [];
			const dataCallbacks: PtyOnData[] = [];
			const exitCallbacks: PtyOnExit[] = [];
			let delivered = 0;
			const stagedPty: Pty & { emit(data: Buffer): void } = {
				pid: 82_001,
				meta: { shell: "/bin/sh", argv: [], cols: 80, rows: 24 },
				write() {},
				resize() {},
				kill() {},
				onData(callback) {
					dataCallbacks.push(callback);
					for (const chunk of pending.splice(0)) {
						delivered += 1;
						callback(chunk);
					}
				},
				onExit(callback) {
					exitCallbacks.push(callback);
				},
				async prepareForHandoff() {},
				pauseOutputForHandoff() {},
				drainOutputForHandoff: async () => [],
				sealOutputForHandoff: async () => [],
				restoreAfterFailedHandoff() {},
				cancelHandoff() {},
				getMasterFd: () => 43,
				emit(data) {
					if (dataCallbacks.length === 0) {
						pending.push(Buffer.from(data));
						return;
					}
					for (const callback of dataCallbacks) {
						delivered += 1;
						callback(Buffer.from(data));
					}
				},
			};
			const server = new Server({
				socketPath,
				daemonVersion: "test-staged",
				adoptPty: () => stagedPty,
			});
			const snapshot: HandoffSnapshot = {
				version: SNAPSHOT_VERSION,
				writtenAt: Date.now(),
				sessions: [
					{
						id: "staged",
						pid: stagedPty.pid,
						meta: stagedPty.meta,
						fdIndex: 4,
						buffer: new Uint8Array(Buffer.from("final-snapshot-cut")),
					},
				],
			};
			server.adoptSnapshot(snapshot);
			stagedPty.emit(Buffer.from("output-produced-after-final-snapshot"));
			expect(dataCallbacks).toHaveLength(0);
			expect(delivered).toBe(0);

			await server.listen();
			const client = await connectAndHello(socketPath);
			try {
				client.send({ type: "subscribe", id: "staged", replay });
				const expectedActivationOutput = replay
					? ["final-snapshot-cut", "output-produced-after-final-snapshot"]
					: ["output-produced-after-final-snapshot"];
				await waitUntil(
					() =>
						client.messages.filter(
							(message) => message.type === "output" && message.id === "staged",
						).length === expectedActivationOutput.length,
				);
				const activationOutput = client.messages.filter(
					(message) => message.type === "output" && message.id === "staged",
				);
				expect(activationOutput.map(payloadAsString)).toEqual(
					expectedActivationOutput,
				);
				expect(dataCallbacks).toHaveLength(1);
				expect(delivered).toBe(1);

				const live = client.waitForNext(
					(message) => message.type === "output" && message.id === "staged",
				);
				stagedPty.emit(Buffer.from("output-produced-after-commit"));
				await live;
				expect(delivered).toBe(2);
			} finally {
				await client.close();
				await server.close();
			}
			expect(exitCallbacks).toHaveLength(1);
		});
	}
});
