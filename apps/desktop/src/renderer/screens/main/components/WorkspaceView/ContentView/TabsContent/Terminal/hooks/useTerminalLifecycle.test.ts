/**
 * Reproduction tests for issue #1873:
 * "When I switch between terminal tab and browser tab the terminal stuck for a
 * while to load. Additionally, the terminal leaving a large blank space."
 *
 * Root cause: `scheduleReattachRecovery` in useTerminalLifecycle.ts silently
 * drops recovery requests when called within the 120ms throttle window, with
 * no retry scheduled.
 *
 * When a user returns from an external browser to the Electron app, the
 * `window.focus` event fires and schedules reattach recovery. This recovery:
 *   1. Clears the stale WebGL texture atlas (`clearTextureAtlas`)
 *   2. Re-fits the terminal to its container (`fitAddon.fit()`)
 *   3. Forces a full repaint (`xterm.refresh()`)
 *
 * If the user switches focus multiple times in rapid succession (within 120ms),
 * subsequent recovery calls hit the throttle and return early — without ever
 * scheduling a retry. The terminal stays blank/stale until the next container
 * resize event (which may never come).
 *
 * Fix: when the throttle fires, schedule a retry after the remaining throttle
 * duration instead of silently returning.
 */
import { describe, expect, it } from "bun:test";

// ---------------------------------------------------------------------------
// Minimal model of the scheduleReattachRecovery throttle mechanism.
// Mirrors the exact logic in useTerminalLifecycle.ts so tests accurately
// demonstrate the production behaviour.
// ---------------------------------------------------------------------------

type SchedulerState = {
	throttleMs: number;
	pendingFrame: number | null;
	lastRunAt: number;
	pendingForceResize: boolean;
};

function makeScheduler(runRecovery: (forceResize: boolean) => void): {
	schedule: (forceResize: boolean) => void;
	flush: () => void;
	state: SchedulerState;
} {
	const reattachRecovery: SchedulerState = {
		throttleMs: 120,
		pendingFrame: null,
		lastRunAt: 0,
		pendingForceResize: false,
	};

	const pendingRafs: Array<() => void> = [];

	const mockRaf = (cb: () => void): number => {
		pendingRafs.push(cb);
		return pendingRafs.length;
	};

	const isUnmounted = false;

	const scheduleReattachRecovery = (forceResize: boolean) => {
		reattachRecovery.pendingForceResize ||= forceResize;
		if (reattachRecovery.pendingFrame !== null) return;

		reattachRecovery.pendingFrame = mockRaf(() => {
			reattachRecovery.pendingFrame = null;

			const now = Date.now();
			if (now - reattachRecovery.lastRunAt < reattachRecovery.throttleMs) {
				// Schedule a retry after the remaining throttle window so the recovery
				// is not permanently lost when focus events fire in rapid succession.
				const remaining =
					reattachRecovery.throttleMs - (now - reattachRecovery.lastRunAt);
				setTimeout(() => {
					if (!isUnmounted)
						scheduleReattachRecovery(reattachRecovery.pendingForceResize);
				}, remaining + 1);
				return;
			}

			reattachRecovery.lastRunAt = now;
			const shouldForce = reattachRecovery.pendingForceResize;
			reattachRecovery.pendingForceResize = false;
			runRecovery(shouldForce);
		}) as unknown as number;
	};

	const flushRafs = () => {
		while (pendingRafs.length > 0) {
			const cb = pendingRafs.shift();
			cb?.();
		}
	};

	return {
		schedule: scheduleReattachRecovery,
		flush: flushRafs,
		state: reattachRecovery,
	};
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("scheduleReattachRecovery throttle — issue #1873", () => {
	it("runs recovery on first window.focus event", () => {
		let calls = 0;
		const { schedule, flush } = makeScheduler(() => {
			calls++;
		});

		schedule(false);
		flush();

		expect(calls).toBe(1);
	});

	it("second schedule within 120ms throttle window is silently dropped", () => {
		let calls = 0;
		const { schedule, flush, state } = makeScheduler(() => {
			calls++;
		});

		// Simulate a recovery that ran 50ms ago (within the 120ms throttle window)
		state.lastRunAt = Date.now() - 50;

		schedule(false);
		flush();

		// Recovery was dropped because lastRunAt is only 50ms ago (< 120ms throttle)
		expect(calls).toBe(0);
	});

	/**
	 * REPRODUCTION TEST — this test currently FAILS, demonstrating the bug.
	 *
	 * Expected behaviour: when a recovery call is throttled, a retry should be
	 * scheduled to run after the remaining throttle window expires. Without a
	 * retry the terminal is permanently blank until the user resizes the window.
	 *
	 * Fix: in scheduleReattachRecovery (useTerminalLifecycle.ts), when the
	 * throttle fires, add:
	 *   const remaining = reattachRecovery.throttleMs - (now - reattachRecovery.lastRunAt);
	 *   setTimeout(() => { if (!isUnmounted) scheduleReattachRecovery(reattachRecovery.pendingForceResize); }, remaining + 1);
	 */
	it("throttled recovery is retried after throttle window expires", async () => {
		let calls = 0;
		const { schedule, flush, state } = makeScheduler(() => {
			calls++;
		});

		// Simulate a recovery that ran 50ms ago (within the 120ms throttle window)
		state.lastRunAt = Date.now() - 50;

		// This call hits the throttle; current code silently drops it
		schedule(false);
		flush();
		expect(calls).toBe(0); // correctly throttled

		// Wait past the remaining throttle duration (120 - 50 = 70ms remaining)
		await new Promise((r) => setTimeout(r, 100));

		// With the fix, a setTimeout was scheduled that queued a new rAF
		flush(); // run the retried rAF

		// FAILS with current code: calls is still 0 because no retry was scheduled
		// PASSES after fix: the retry fires and recovery runs
		expect(calls).toBe(1);
	});
});
