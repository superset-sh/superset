import { describe, expect, test } from "bun:test";
import type {
	DaemonClient,
	ExitInfo,
	SubscribeCallbacks,
} from "./DaemonClient/index.ts";
import { __makeDaemonPtyForTesting } from "./terminal.ts";

interface BoundSubscription {
	id: string;
	replay: boolean;
	callbacks: SubscribeCallbacks;
	disposed: boolean;
}

function fakeDaemon(options: { throwOnDispose?: boolean } = {}) {
	const subscriptions: BoundSubscription[] = [];
	const daemon = {
		subscribe(
			id: string,
			{ replay }: { replay: boolean },
			callbacks: SubscribeCallbacks,
		) {
			const bound: BoundSubscription = {
				id,
				replay,
				callbacks,
				disposed: false,
			};
			subscriptions.push(bound);
			return () => {
				bound.disposed = true;
				if (options.throwOnDispose) {
					throw new Error("predecessor transport already closed");
				}
			};
		},
	};
	return { daemon: daemon as unknown as DaemonClient, subscriptions };
}

describe("DaemonPty planned rotation", () => {
	test("rebinds primary and auxiliary subscribers before held input can flush", () => {
		const predecessor = fakeDaemon({ throwOnDispose: true });
		const successor = fakeDaemon();
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

		// A closed predecessor may make unsubscribe throw. Rotation must still
		// bind every observer to the proven successor and must not replay the
		// already-rendered scrollback into xterm a second time.
		pty.rebindDaemon(successor.daemon);
		expect(predecessor.subscriptions.every(({ disposed }) => disposed)).toBe(
			true,
		);
		expect(successor.subscriptions).toHaveLength(3);
		expect(
			successor.subscriptions.map(({ id, replay }) => ({ id, replay })),
		).toEqual([
			{ id: "session-rotation", replay: false },
			{ id: "session-rotation", replay: false },
			{ id: "session-rotation", replay: false },
		]);

		for (const subscription of successor.subscriptions) {
			subscription.callbacks.onOutput(Buffer.from("after-rotation"));
			subscription.callbacks.onExit({ code: 7, signal: 9 });
		}
		expect(primaryOutput).toEqual(["after-rotation"]);
		expect(auxiliaryOutput).toEqual(["after-rotation"]);
		expect(primaryExit).toEqual([{ code: 7, signal: 9 }]);
		expect(auxiliaryExit).toEqual([{ exitCode: 7, signal: 9 }]);

		// Disposers returned before the rotation still own their successor-side
		// subscriptions; teardown cannot leave hidden observers on an old client.
		primary.dispose();
		data.dispose();
		exit.dispose();
		expect(successor.subscriptions.every(({ disposed }) => disposed)).toBe(
			true,
		);
	});

	test("disposeSubscriptions tears down all rebound observers idempotently", () => {
		const predecessor = fakeDaemon();
		const successor = fakeDaemon();
		const pty = __makeDaemonPtyForTesting(
			predecessor.daemon,
			"session-dispose",
		);

		pty.onData(() => {});
		pty.onExit(() => {});
		pty.rebindDaemon(successor.daemon);
		pty.disposeSubscriptions();
		pty.disposeSubscriptions();

		expect(successor.subscriptions).toHaveLength(2);
		expect(successor.subscriptions.every(({ disposed }) => disposed)).toBe(
			true,
		);
	});
});
