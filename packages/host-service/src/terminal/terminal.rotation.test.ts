import { describe, expect, test } from "bun:test";
import type {
	DaemonClient,
	ExitInfo,
	ReplayBoundary,
	SubscribeCallbacks,
} from "./DaemonClient/index.ts";
import { __makeDaemonPtyForTesting } from "./terminal.ts";

interface BoundSubscription {
	id: string;
	replay: boolean;
	callbacks: SubscribeCallbacks;
	disposed: boolean;
}

function fakeDaemon(
	options: {
		throwOnDispose?: boolean;
		replay?: Buffer;
		liveBeforeBoundary?: Buffer;
		exitBeforeBoundary?: ExitInfo;
		replayStartBytes?: number;
		replayEndBytes?: number;
	} = {},
) {
	const subscriptions: BoundSubscription[] = [];
	const bind = (
		id: string,
		replay: boolean,
		callbacks: SubscribeCallbacks,
	): BoundSubscription => {
		const bound: BoundSubscription = {
			id,
			replay,
			callbacks,
			disposed: false,
		};
		subscriptions.push(bound);
		return bound;
	};
	const dispose = (bound: BoundSubscription) => {
		bound.disposed = true;
		if (options.throwOnDispose) {
			throw new Error("predecessor transport already closed");
		}
	};
	const daemon = {
		subscribe(
			id: string,
			{ replay }: { replay: boolean },
			callbacks: SubscribeCallbacks,
		) {
			const bound = bind(id, replay, callbacks);
			return () => dispose(bound);
		},
		subscribeWithReplayBoundary(
			id: string,
			{ replay }: { replay: boolean },
			callbacks: SubscribeCallbacks,
		): { unsubscribe: () => void; boundary: Promise<ReplayBoundary> } {
			const bound = bind(id, replay, callbacks);
			const bytes = replay
				? (options.replay ?? Buffer.alloc(0))
				: Buffer.alloc(0);
			if (bytes.byteLength > 0) callbacks.onOutput(Buffer.from(bytes));
			if (options.liveBeforeBoundary?.byteLength) {
				callbacks.onOutput(Buffer.from(options.liveBeforeBoundary));
			}
			if (options.exitBeforeBoundary) {
				callbacks.onExit({ ...options.exitBeforeBoundary });
			}
			return {
				unsubscribe: () => dispose(bound),
				boundary: Promise.resolve({
					replayBytes: bytes.byteLength,
					replayStartBytes: options.replayStartBytes ?? 0,
					replayEndBytes:
						options.replayEndBytes ??
						(options.replayStartBytes ?? 0) + bytes.byteLength,
				}),
			};
		},
	};
	return {
		daemon: daemon as unknown as DaemonClient,
		subscriptions,
		emitOutput(chunk: Buffer | string) {
			const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
			for (const subscription of subscriptions) {
				if (!subscription.disposed) {
					subscription.callbacks.onOutput(Buffer.from(bytes));
				}
			}
		},
		emitExit(info: ExitInfo) {
			for (const subscription of subscriptions) {
				if (!subscription.disposed) subscription.callbacks.onExit(info);
			}
		},
	};
}

describe("DaemonPty planned rotation", () => {
	test("publishes one staged successor stream to every observer only after commit", async () => {
		const alreadyRendered = Buffer.from("already-rendered");
		const predecessor = fakeDaemon({
			throwOnDispose: true,
			replay: alreadyRendered,
			replayStartBytes: 0,
			replayEndBytes: alreadyRendered.byteLength,
		});
		const successor = fakeDaemon({
			replay: alreadyRendered,
			replayStartBytes: 0,
			replayEndBytes: alreadyRendered.byteLength,
		});
		const pty = __makeDaemonPtyForTesting(
			predecessor.daemon,
			"session-rotation",
		);

		const primaryOutput: string[] = [];
		const primaryExit: ExitInfo[] = [];
		const auxiliaryOutput: string[] = [];
		const auxiliaryExit: Array<{ exitCode: number; signal: number }> = [];
		const primary = pty.subscribe(
			{ replay: true },
			{
				onOutput: (chunk) => primaryOutput.push(chunk.toString("utf8")),
				onExit: (info) => primaryExit.push(info),
			},
		);
		const data = pty.onData((chunk) => auxiliaryOutput.push(chunk));
		const exit = pty.onExit((info) => auxiliaryExit.push(info));

		expect(predecessor.subscriptions.map(({ replay }) => replay)).toEqual([
			true,
		]);

		const binding = await pty.stageDaemonRebind(successor.daemon);
		successor.emitOutput("gap-before-activation-ack");
		expect(primaryOutput).toEqual(["already-rendered"]);
		expect(auxiliaryOutput).toEqual([]);
		expect(successor.subscriptions).toHaveLength(1);
		expect(successor.subscriptions[0]?.replay).toBe(true);

		binding.validate();
		binding.commit();
		expect(predecessor.subscriptions.every(({ disposed }) => disposed)).toBe(
			true,
		);
		expect(primaryOutput).toEqual([
			"already-rendered",
			"gap-before-activation-ack",
		]);
		expect(auxiliaryOutput).toEqual(["gap-before-activation-ack"]);

		successor.emitOutput("after-rotation");
		successor.emitExit({ code: 7, signal: 9 });
		expect(primaryOutput).toEqual([
			"already-rendered",
			"gap-before-activation-ack",
			"after-rotation",
		]);
		expect(auxiliaryOutput).toEqual([
			"gap-before-activation-ack",
			"after-rotation",
		]);
		expect(primaryExit).toEqual([{ code: 7, signal: 9 }]);
		expect(auxiliaryExit).toEqual([{ exitCode: 7, signal: 9 }]);

		primary.dispose();
		data.dispose();
		expect(successor.subscriptions[0]?.disposed).toBe(false);
		exit.dispose();
		expect(successor.subscriptions[0]?.disposed).toBe(false);
		pty.disposeSubscriptions();
		expect(successor.subscriptions[0]?.disposed).toBe(true);
	});

	test("includes live bytes received after replay but before the observed boundary", async () => {
		const replay = Buffer.from("replay-prefix");
		const liveBeforeBoundary = Buffer.from("live-before-boundary");
		const successorGap = Buffer.from("successor-gap");
		const observed = Buffer.concat([replay, liveBeforeBoundary]);
		const predecessor = fakeDaemon({
			replay,
			liveBeforeBoundary,
			replayStartBytes: 0,
			replayEndBytes: replay.byteLength,
		});
		const successor = fakeDaemon({
			replay: Buffer.concat([observed, successorGap]),
			replayStartBytes: 0,
			replayEndBytes: observed.byteLength + successorGap.byteLength,
		});
		const pty = __makeDaemonPtyForTesting(
			predecessor.daemon,
			"session-live-before-boundary",
		);
		const output: Buffer[] = [];
		const subscription = pty.subscribeWithReplayBoundary(
			{ replay: true },
			{
				onOutput: (chunk) => output.push(Buffer.from(chunk)),
				onExit: () => {},
			},
		);
		await subscription.boundary;

		const binding = await pty.stageDaemonRebind(successor.daemon);
		binding.validate();
		binding.commit();

		expect(Buffer.concat(output)).toEqual(
			Buffer.concat([observed, successorGap]),
		);
	});

	test("publishes the successor suffix beyond the host-observed cursor exactly once", async () => {
		const observedPrefix = Buffer.from([0x10, 0x00, 0xff, 0x41]);
		const socketGap = Buffer.from([0x00, 0xfe, 0x7f, 0x42, 0x42]);
		const predecessor = fakeDaemon({
			replay: observedPrefix,
			replayStartBytes: 0,
			replayEndBytes: observedPrefix.byteLength,
		});
		const successor = fakeDaemon({
			replay: Buffer.concat([observedPrefix, socketGap]),
			replayStartBytes: 0,
			replayEndBytes: observedPrefix.byteLength + socketGap.byteLength,
		});
		const pty = __makeDaemonPtyForTesting(
			predecessor.daemon,
			"session-observed-cursor",
		);
		const output: Buffer[] = [];
		const subscription = pty.subscribeWithReplayBoundary(
			{ replay: true },
			{
				onOutput: (chunk) => output.push(Buffer.from(chunk)),
				onExit: () => {},
			},
		);
		await subscription.boundary;

		const binding = await pty.stageDaemonRebind(successor.daemon);
		binding.validate();
		binding.commit();

		expect(Buffer.concat(output)).toEqual(
			Buffer.concat([observedPrefix, socketGap]),
		);
	});

	test("does not replay a successor suffix observed from the predecessor after staging", async () => {
		const observedPrefix = Buffer.from("N");
		const socketGap = Buffer.from("G");
		const predecessor = fakeDaemon({
			replay: observedPrefix,
			replayStartBytes: 0,
			replayEndBytes: observedPrefix.byteLength,
		});
		const successor = fakeDaemon({
			replay: Buffer.concat([observedPrefix, socketGap]),
			replayStartBytes: 0,
			replayEndBytes: observedPrefix.byteLength + socketGap.byteLength,
		});
		const pty = __makeDaemonPtyForTesting(
			predecessor.daemon,
			"session-late-predecessor-output",
		);
		const output: Buffer[] = [];
		const subscription = pty.subscribeWithReplayBoundary(
			{ replay: true },
			{
				onOutput: (chunk) => output.push(Buffer.from(chunk)),
				onExit: () => {},
			},
		);
		await subscription.boundary;

		const binding = await pty.stageDaemonRebind(successor.daemon);
		binding.validate();
		predecessor.emitOutput(socketGap);
		binding.commit();

		expect(Buffer.concat(output)).toEqual(
			Buffer.concat([observedPrefix, socketGap]),
		);
	});

	test("publishes one exit when predecessor and successor exit before commit", async () => {
		const exit = { code: 7, signal: 9 };
		const predecessor = fakeDaemon({
			replayStartBytes: 0,
			replayEndBytes: 0,
		});
		const successor = fakeDaemon({
			exitBeforeBoundary: exit,
			replayStartBytes: 0,
			replayEndBytes: 0,
		});
		const pty = __makeDaemonPtyForTesting(
			predecessor.daemon,
			"session-double-exit",
		);
		const exits: ExitInfo[] = [];
		pty.subscribe(
			{ replay: false },
			{
				onOutput: () => {},
				onExit: (info) => exits.push(info),
			},
		);

		const binding = await pty.stageDaemonRebind(successor.daemon);
		binding.validate();
		predecessor.emitExit(exit);
		binding.commit();

		expect(exits).toEqual([exit]);
	});

	test("fails closed when the host-observed cursor is outside successor replay", async () => {
		const observedPrefix = Buffer.from("observed");
		const successorReplay = Buffer.from("later");
		const predecessor = fakeDaemon({
			replay: observedPrefix,
			replayStartBytes: 0,
			replayEndBytes: observedPrefix.byteLength,
		});
		const successor = fakeDaemon({
			replay: successorReplay,
			replayStartBytes: observedPrefix.byteLength + 1,
			replayEndBytes:
				observedPrefix.byteLength + 1 + successorReplay.byteLength,
		});
		const pty = __makeDaemonPtyForTesting(
			predecessor.daemon,
			"session-observed-cursor-out-of-range",
		);
		const output: Buffer[] = [];
		const subscription = pty.subscribeWithReplayBoundary(
			{ replay: true },
			{
				onOutput: (chunk) => output.push(Buffer.from(chunk)),
				onExit: () => {},
			},
		);
		await subscription.boundary;

		const binding = await pty.stageDaemonRebind(successor.daemon);
		expect(() => binding.validate()).toThrow(
			/host-observed cursor .* outside successor replay/,
		);
		binding.discard({ final: true });

		expect(Buffer.concat(output)).toEqual(observedPrefix);
		expect(successor.subscriptions[0]?.disposed).toBe(true);
	});

	test("recovers binary output produced between successor sockets exactly once", async () => {
		const cut = Buffer.from([0x10, 0x00, 0xff, 0x41]);
		const betweenSockets = Buffer.from([0x00, 0xfe, 0x7f, 0x42, 0x42]);
		const predecessor = fakeDaemon({
			replayStartBytes: cut.byteLength,
			replayEndBytes: cut.byteLength,
		});
		const firstSuccessor = fakeDaemon({
			replay: cut,
			replayStartBytes: 0,
			replayEndBytes: cut.byteLength,
		});
		const secondSuccessor = fakeDaemon({
			replay: Buffer.concat([cut, betweenSockets]),
			replayStartBytes: 0,
			replayEndBytes: cut.byteLength + betweenSockets.byteLength,
		});
		const pty = __makeDaemonPtyForTesting(predecessor.daemon, "session-retry");
		const observed: Buffer[] = [];
		pty.subscribe(
			{ replay: false },
			{
				onOutput: (chunk) => observed.push(Buffer.from(chunk)),
				onExit: () => {},
			},
		);

		const first = await pty.stageDaemonRebind(firstSuccessor.daemon);
		firstSuccessor.emitOutput(betweenSockets);
		first.discard({ final: false });
		expect(observed).toEqual([]);

		const second = await pty.stageDaemonRebind(secondSuccessor.daemon);
		second.validate();
		second.commit();

		expect(Buffer.concat(observed)).toEqual(betweenSockets);
		expect(
			Buffer.concat(observed).subarray(0, betweenSockets.byteLength),
		).toEqual(betweenSockets);
		expect(firstSuccessor.subscriptions[0]?.disposed).toBe(true);
	});

	test("publishes a carried retry suffix before one replacement exit", async () => {
		const cut = Buffer.from("observed-cut");
		const unpublishedSuffix = Buffer.from("unpublished-suffix");
		const exit = { code: 7, signal: 9 };
		const predecessor = fakeDaemon({
			replayStartBytes: cut.byteLength,
			replayEndBytes: cut.byteLength,
		});
		const firstSuccessor = fakeDaemon({
			replay: cut,
			liveBeforeBoundary: unpublishedSuffix,
			exitBeforeBoundary: exit,
			replayStartBytes: 0,
			replayEndBytes: cut.byteLength,
		});
		const secondSuccessor = fakeDaemon({
			replay: Buffer.concat([cut, unpublishedSuffix]),
			exitBeforeBoundary: exit,
			replayStartBytes: 0,
			replayEndBytes: cut.byteLength + unpublishedSuffix.byteLength,
		});
		const pty = __makeDaemonPtyForTesting(
			predecessor.daemon,
			"session-retry-exit",
		);
		const events: string[] = [];
		pty.subscribe(
			{ replay: false },
			{
				onOutput: (chunk) => events.push(`output:${chunk.toString("utf8")}`),
				onExit: ({ code, signal }) => events.push(`exit:${code}:${signal}`),
			},
		);

		const first = await pty.stageDaemonRebind(firstSuccessor.daemon);
		first.discard({ final: false });
		expect(events).toEqual([]);

		const second = await pty.stageDaemonRebind(secondSuccessor.daemon);
		second.validate();
		second.commit();

		expect(events).toEqual(["output:unpublished-suffix", "exit:7:9"]);
	});

	test("keeps the aggregate cursor live across subscriber churn", async () => {
		const initial = Buffer.from("A");
		const afterFirstRotation = Buffer.from("B");
		const predecessor = fakeDaemon({
			replay: initial,
			replayStartBytes: 0,
			replayEndBytes: initial.byteLength,
		});
		const firstSuccessor = fakeDaemon({
			replay: initial,
			replayStartBytes: 0,
			replayEndBytes: initial.byteLength,
		});
		const secondSuccessor = fakeDaemon({
			replay: Buffer.concat([initial, afterFirstRotation]),
			replayStartBytes: 0,
			replayEndBytes: initial.byteLength + afterFirstRotation.byteLength,
		});
		const pty = __makeDaemonPtyForTesting(
			predecessor.daemon,
			"session-subscriber-churn",
		);
		const primaryOutput: Buffer[] = [];
		const primary = pty.subscribeWithReplayBoundary(
			{ replay: true },
			{
				onOutput: (chunk) => primaryOutput.push(Buffer.from(chunk)),
				onExit: () => {},
			},
		);
		await primary.boundary;

		const firstBinding = await pty.stageDaemonRebind(firstSuccessor.daemon);
		firstBinding.validate();
		firstBinding.commit();

		const replacementOutput: Buffer[] = [];
		pty.subscribe(
			{ replay: false },
			{
				onOutput: (chunk) => replacementOutput.push(Buffer.from(chunk)),
				onExit: () => {},
			},
		);
		primary.dispose();
		firstSuccessor.emitOutput(afterFirstRotation);

		const secondBinding = await pty.stageDaemonRebind(secondSuccessor.daemon);
		secondBinding.validate();
		secondBinding.commit();

		expect(Buffer.concat(primaryOutput)).toEqual(initial);
		expect(Buffer.concat(replacementOutput)).toEqual(afterFirstRotation);
	});

	test("disposeSubscriptions tears down the aggregate successor observer idempotently", async () => {
		const predecessor = fakeDaemon();
		const successor = fakeDaemon();
		const pty = __makeDaemonPtyForTesting(
			predecessor.daemon,
			"session-dispose",
		);

		pty.onData(() => {});
		pty.onExit(() => {});
		const binding = await pty.stageDaemonRebind(successor.daemon);
		binding.commit();
		pty.disposeSubscriptions();
		pty.disposeSubscriptions();

		expect(successor.subscriptions).toHaveLength(1);
		expect(successor.subscriptions[0]?.disposed).toBe(true);
	});
});
