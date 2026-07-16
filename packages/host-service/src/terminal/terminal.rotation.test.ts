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
		const predecessor = fakeDaemon({ throwOnDispose: true });
		const successor = fakeDaemon({ replay: Buffer.from("already-rendered") });
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
			false,
			false,
		]);

		const binding = await pty.stageDaemonRebind(successor.daemon);
		successor.emitOutput("gap-before-activation-ack");
		expect(primaryOutput).toEqual([]);
		expect(auxiliaryOutput).toEqual([]);
		expect(successor.subscriptions).toHaveLength(1);
		expect(successor.subscriptions[0]?.replay).toBe(true);

		binding.validate();
		binding.commit();
		expect(predecessor.subscriptions.every(({ disposed }) => disposed)).toBe(
			true,
		);
		expect(primaryOutput).toEqual(["gap-before-activation-ack"]);
		expect(auxiliaryOutput).toEqual(["gap-before-activation-ack"]);

		successor.emitOutput("after-rotation");
		successor.emitExit({ code: 7, signal: 9 });
		expect(primaryOutput).toEqual([
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
		expect(successor.subscriptions[0]?.disposed).toBe(true);
	});

	test("recovers binary output produced between successor sockets exactly once", async () => {
		const cut = Buffer.from([0x10, 0x00, 0xff, 0x41]);
		const betweenSockets = Buffer.from([0x00, 0xfe, 0x7f, 0x42, 0x42]);
		const predecessor = fakeDaemon();
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
