import { describe, expect, mock, test } from "bun:test";
import {
	createShutdown,
	DISPOSE_TIMEOUT_MS,
	SHUTDOWN_GRACE_MS,
	type ShutdownDeps,
	type ShutdownServer,
} from "./shutdown";

interface Timer {
	callback: () => void;
	delayMs: number;
	cancelled: boolean;
}

interface Harness {
	shutdown: (reason: string) => void;
	server: ShutdownServer & {
		close: ReturnType<typeof mock>;
		closeAllConnections: ReturnType<typeof mock>;
	};
	exit: ReturnType<typeof mock>;
	hardExit: ReturnType<typeof mock>;
	clearReclaimTimer: ReturnType<typeof mock>;
	timers: Timer[];
	logs: string[];
	/** Run the next pending timer (the grace window, then the dispose deadline). */
	fireNextTimer(): Timer;
	/** Let the dispose promise's continuations run. */
	settle(): Promise<void>;
}

function createHarness(
	overrides: Partial<ShutdownDeps> & {
		dispose?: (() => Promise<void>) | null;
		hasServer?: boolean;
	} = {},
): Harness {
	const {
		dispose = async () => {},
		hasServer = true,
		...depOverrides
	} = overrides;
	const server = {
		close: mock(() => {}),
		closeAllConnections: mock(() => {}),
	};
	const exit = mock((_code: number) => {});
	const hardExit = mock(() => {});
	const clearReclaimTimer = mock(() => {});
	const timers: Timer[] = [];
	const logs: string[] = [];

	const shutdown = createShutdown({
		getServer: () => (hasServer ? server : null),
		getDispose: () => dispose,
		clearReclaimTimer,
		exit,
		hardExit,
		scheduleTimer: (callback, delayMs) => {
			const timer: Timer = { callback, delayMs, cancelled: false };
			timers.push(timer);
			return () => {
				timer.cancelled = true;
			};
		},
		log: (message) => logs.push(message),
		...depOverrides,
	});

	return {
		shutdown,
		server,
		exit,
		hardExit,
		clearReclaimTimer,
		timers,
		logs,
		fireNextTimer() {
			const next = timers.find((t) => !t.cancelled && !("fired" in t));
			if (!next) throw new Error("no pending timer");
			Object.assign(next, { fired: true });
			next.callback();
			return next;
		},
		async settle() {
			await Promise.resolve();
			await Promise.resolve();
			await Promise.resolve();
		},
	};
}

describe("createShutdown", () => {
	test("exits 0 without a drain window when the server never bound and there is nothing to dispose", () => {
		const h = createHarness({ hasServer: false, dispose: null });

		h.shutdown("SIGTERM");

		expect(h.clearReclaimTimer).toHaveBeenCalledTimes(1);
		expect(h.exit).toHaveBeenCalledWith(0);
		expect(h.hardExit).not.toHaveBeenCalled();
		expect(h.timers).toHaveLength(0);
	});

	test("server never bound but createApp ran: disposes under the deadline, no drain window", async () => {
		const dispose = mock(async () => {});
		const h = createHarness({ hasServer: false, dispose });

		h.shutdown("SIGTERM");
		expect(dispose).toHaveBeenCalledTimes(1);
		expect(h.server.close).not.toHaveBeenCalled();
		expect(h.timers).toHaveLength(1);
		expect(h.timers[0]?.delayMs).toBe(DISPOSE_TIMEOUT_MS);

		await h.settle();
		expect(h.exit).toHaveBeenCalledWith(0);
		expect(h.hardExit).not.toHaveBeenCalled();
	});

	test("server never bound and dispose wedged: hard-exits at the deadline", async () => {
		const h = createHarness({
			hasServer: false,
			dispose: () => new Promise<void>(() => {}),
		});

		h.shutdown("SIGTERM");
		await h.settle();
		expect(h.exit).not.toHaveBeenCalled();

		h.fireNextTimer();
		expect(h.hardExit).toHaveBeenCalledTimes(1);
	});

	test("closes the server, then after the grace tears sockets down, disposes and exits 0", async () => {
		const dispose = mock(async () => {});
		const h = createHarness({ dispose });

		h.shutdown("SIGTERM");

		expect(h.clearReclaimTimer).toHaveBeenCalledTimes(1);
		expect(h.server.close).toHaveBeenCalledTimes(1);
		expect(h.server.closeAllConnections).not.toHaveBeenCalled();
		expect(h.exit).not.toHaveBeenCalled();

		const grace = h.fireNextTimer();
		expect(grace.delayMs).toBe(SHUTDOWN_GRACE_MS);
		expect(h.server.closeAllConnections).toHaveBeenCalledTimes(1);
		expect(dispose).toHaveBeenCalledTimes(1);

		await h.settle();
		expect(h.exit).toHaveBeenCalledWith(0);
		expect(h.hardExit).not.toHaveBeenCalled();
		// The dispose deadline was armed and then cancelled by the resolve.
		const deadline = h.timers[1];
		expect(deadline?.delayMs).toBe(DISPOSE_TIMEOUT_MS);
		expect(deadline?.cancelled).toBe(true);
		expect(h.logs.at(-1)).toContain("shutdown complete");
	});

	test("hard-exits when dispose never resolves (wedged worker)", async () => {
		const h = createHarness({ dispose: () => new Promise<void>(() => {}) });

		h.shutdown("parent-exit");
		h.fireNextTimer();
		await h.settle();
		expect(h.exit).not.toHaveBeenCalled();

		const deadline = h.fireNextTimer();
		expect(deadline.delayMs).toBe(DISPOSE_TIMEOUT_MS);
		expect(h.hardExit).toHaveBeenCalledTimes(1);
		expect(h.exit).not.toHaveBeenCalled();
		expect(h.logs.at(-1)).toContain("hard-exiting");
	});

	test("a dispose that resolves after the deadline does not exit twice", async () => {
		let resolveDispose: () => void = () => {};
		const h = createHarness({
			dispose: () =>
				new Promise<void>((resolve) => {
					resolveDispose = resolve;
				}),
		});

		h.shutdown("SIGTERM");
		h.fireNextTimer();
		h.fireNextTimer();
		expect(h.hardExit).toHaveBeenCalledTimes(1);

		resolveDispose();
		await h.settle();
		expect(h.exit).not.toHaveBeenCalled();
	});

	test("a rejected dispose still exits 0 instead of hanging", async () => {
		const h = createHarness({
			dispose: async () => {
				throw new Error("db already closed");
			},
		});

		h.shutdown("SIGINT");
		h.fireNextTimer();
		await h.settle();

		expect(h.exit).toHaveBeenCalledWith(0);
		expect(h.hardExit).not.toHaveBeenCalled();
		expect(h.logs.some((l) => l.includes("dispose failed"))).toBe(true);
	});

	test("exits 0 after the grace when createApp has not run yet", () => {
		const h = createHarness({ dispose: null });

		h.shutdown("SIGTERM");
		h.fireNextTimer();

		expect(h.server.closeAllConnections).toHaveBeenCalledTimes(1);
		expect(h.exit).toHaveBeenCalledWith(0);
		expect(h.timers).toHaveLength(1);
	});

	test("a second signal while shutting down hard-exits immediately", () => {
		const h = createHarness({ dispose: () => new Promise<void>(() => {}) });

		h.shutdown("SIGTERM");
		h.shutdown("SIGTERM");

		expect(h.hardExit).toHaveBeenCalledTimes(1);
		expect(h.server.close).toHaveBeenCalledTimes(1);
		expect(h.clearReclaimTimer).toHaveBeenCalledTimes(1);
		expect(h.exit).not.toHaveBeenCalled();
	});
});
