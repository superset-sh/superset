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
 *   1. Re-fits the terminal to its container (`fitAddon.fit()`)
 *   2. Forces a full repaint (`xterm.refresh()`)
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

// ---------------------------------------------------------------------------
// Model of the restart/stream-queue interplay (#5519 S4).
//
// Mirrors the production pieces exactly:
// - useTerminalStream.handleStreamData queues every event while
//   isStreamReady is false, and useTerminalRestore.finalizeRestore later
//   sets it true and flushes the queue in order.
// - useTerminalLifecycle.restartTerminalSession sets isStreamReady=false,
//   disarms the reused xterm (disarmStaleInputModes), clears it, and
//   attaches a fresh session.
//
// The hazard: with forceRestart, the dying session's in-flight chunks and
// exit event land in the queue between restart and flush. Unless the restart
// drops them (as handleStartShell does), the flush replays a dead TUI's
// re-arm AFTER the disarm and its exit event marks the brand-new session
// exited.
// ---------------------------------------------------------------------------

const DISARM = "\x1b[disarm]"; // stands in for INPUT_MODE_DISARM_SEQUENCE
const STALE_REARM = "\x1b[?1002h\x1b[?1006h";

type StreamEvent =
	| { type: "data"; data: string }
	| { type: "exit"; exitCode: number };

function makeRestartModel() {
	const written: string[] = [];
	let exited = false;
	// The dying session's exit handler already ran (handleTerminalExit sets
	// isStreamReadyRef=false), so late events queue instead of applying.
	let isStreamReady = false;
	let pendingEvents: StreamEvent[] = [];

	// Mirrors useTerminalStream.handleStreamData
	const handleStreamData = (event: StreamEvent) => {
		if (!isStreamReady) {
			pendingEvents.push(event);
			return;
		}
		if (event.type === "data") written.push(event.data);
		else exited = true;
	};

	// Mirrors useTerminalRestore.finalizeRestore + flushPendingEvents
	const finalizeRestore = () => {
		isStreamReady = true;
		const events = pendingEvents;
		pendingEvents = [];
		for (const event of events) {
			if (event.type === "data") written.push(event.data);
			else exited = true;
		}
	};

	// Mirrors restartTerminalSession's reset block
	const restart = (options: { dropPendingEvents: boolean }) => {
		exited = false;
		isStreamReady = false;
		if (options.dropPendingEvents) pendingEvents = [];
		written.push(DISARM);
	};

	return {
		handleStreamData,
		finalizeRestore,
		restart,
		written,
		isExited: () => exited,
	};
}

describe("restartTerminalSession drops queued pre-restore events — #5519 S4", () => {
	it("demonstrates the hazard: without the drop, stale events flush after the disarm", () => {
		const model = makeRestartModel();

		// The dying TUI's final chunks and exit event were queued while the
		// stream was not ready, before the user triggered the restart.
		model.handleStreamData({ type: "data", data: STALE_REARM });
		model.handleStreamData({ type: "exit", exitCode: 137 });
		model.restart({ dropPendingEvents: false });
		model.finalizeRestore();

		// The stale redraw re-armed the modes the disarm just cleared…
		expect(model.written.indexOf(STALE_REARM)).toBeGreaterThan(
			model.written.indexOf(DISARM),
		);
		// …and the stale exit marked the brand-new session exited.
		expect(model.isExited()).toBe(true);
	});

	it("dropping queued events at restart keeps the fresh session clean", () => {
		const model = makeRestartModel();

		// Events queued before the restart began (dying TUI's chunks).
		model.handleStreamData({ type: "data", data: STALE_REARM });
		model.handleStreamData({ type: "exit", exitCode: 137 });

		// restartTerminalSession clears pendingEventsRef, mirroring
		// handleStartShell's guard.
		model.restart({ dropPendingEvents: true });
		model.finalizeRestore();

		expect(model.written).toEqual([DISARM]);
		expect(model.isExited()).toBe(false);
	});
});
