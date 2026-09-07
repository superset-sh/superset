import { describe, expect, mock, test } from "bun:test";
import {
	DEV_EXIT_DEADLINE_MS,
	DEV_PARENT_POLL_MS,
	installDevRunnerExit,
} from "./dev-runner-exit";

type Listener<T> = (arg: T) => void;

function setup(overrides: { teardown?: () => Promise<void> } = {}) {
	const signalHandlers = new Map<string, () => void>();
	const stdioHandlers: Listener<NodeJS.ErrnoException>[] = [];
	const timers: Array<{ callback: () => void; delayMs: number }> = [];
	let poll: { callback: () => void; intervalMs: number } | null = null;
	let pollStopped = false;
	let parentAlive = true;

	const deps = {
		markQuitting: mock(() => {}),
		stopHostServices: mock(() => {}),
		exit: mock((_code: number) => {}),
		log: mock((_message: string) => {}),
	};

	installDevRunnerExit({
		parentPid: 4242,
		stdio: [
			{
				on: (_event, listener) => {
					stdioHandlers.push(listener);
				},
			},
		],
		subscribeSignal: (signal, handler) => {
			signalHandlers.set(signal, handler);
		},
		teardownTerminalHost: overrides.teardown ?? (() => Promise.resolve()),
		isProcessAlive: () => parentAlive,
		scheduleTimer: (callback, delayMs) => {
			timers.push({ callback, delayMs });
		},
		scheduleInterval: (callback, intervalMs) => {
			poll = { callback, intervalMs };
			return () => {
				pollStopped = true;
			};
		},
		...deps,
	});

	return {
		...deps,
		signal: (name: string) => signalHandlers.get(name)?.(),
		stdioError: (code: string) => {
			for (const handler of stdioHandlers) {
				handler(Object.assign(new Error(`write ${code}`), { code }));
			}
		},
		timers,
		fireTimers: () => {
			for (const timer of timers.splice(0)) timer.callback();
		},
		tickPoll: () => poll?.callback(),
		pollIntervalMs: () => poll?.intervalMs,
		isPollStopped: () => pollStopped,
		killParent: () => {
			parentAlive = false;
		},
	};
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("installDevRunnerExit", () => {
	test("SIGTERM marks quitting, stops services, and exits once teardown finishes", async () => {
		const h = setup();
		h.signal("SIGTERM");
		expect(h.markQuitting).toHaveBeenCalledTimes(1);
		expect(h.stopHostServices).toHaveBeenCalledTimes(1);
		expect(h.exit).not.toHaveBeenCalled();
		await settle();
		expect(h.exit).toHaveBeenCalledWith(0);
		expect(h.exit).toHaveBeenCalledTimes(1);
	});

	test("exits at the deadline when teardown never resolves", () => {
		const h = setup({ teardown: () => new Promise(() => {}) });
		h.signal("SIGINT");
		expect(h.exit).not.toHaveBeenCalled();
		expect(h.timers).toEqual([
			expect.objectContaining({ delayMs: DEV_EXIT_DEADLINE_MS }),
		]);
		h.fireTimers();
		expect(h.exit).toHaveBeenCalledTimes(1);
	});

	test("exits only once even when the deadline fires after teardown", async () => {
		const h = setup();
		h.signal("SIGTERM");
		await settle();
		h.fireTimers();
		expect(h.exit).toHaveBeenCalledTimes(1);
	});

	test("a second reason after the first is ignored", async () => {
		const h = setup();
		h.signal("SIGTERM");
		h.signal("SIGINT");
		h.stdioError("EPIPE");
		await settle();
		expect(h.markQuitting).toHaveBeenCalledTimes(1);
		expect(h.stopHostServices).toHaveBeenCalledTimes(1);
		expect(h.exit).toHaveBeenCalledTimes(1);
	});

	test("EPIPE on stdio quits as stdio-closed", () => {
		const h = setup();
		h.stdioError("EPIPE");
		expect(h.markQuitting).toHaveBeenCalledTimes(1);
		expect(h.log).toHaveBeenCalledWith(
			"[main] Received stdio-closed, quitting...",
		);
	});

	test("other stdio errors are swallowed without quitting", () => {
		const h = setup();
		h.stdioError("EAGAIN");
		expect(h.markQuitting).not.toHaveBeenCalled();
		expect(h.stopHostServices).not.toHaveBeenCalled();
	});

	test("polls the parent every second and quits when it is gone", () => {
		const h = setup();
		expect(h.pollIntervalMs()).toBe(DEV_PARENT_POLL_MS);
		h.tickPoll();
		expect(h.markQuitting).not.toHaveBeenCalled();
		expect(h.isPollStopped()).toBe(false);
		h.killParent();
		h.tickPoll();
		expect(h.isPollStopped()).toBe(true);
		expect(h.log).toHaveBeenCalledWith(
			"[main] Received parent-exit, quitting...",
		);
	});
});
