/**
 * Reproduction test for issue #2277:
 * "Stuck on Connection lost. Reconnecting v 1.1.3"
 *
 * Root cause: the `retryCountRef` in Terminal.tsx is never reset to 0 after a
 * successful reconnection unless a data event arrives *while* connectionError
 * is still set.  Because `handleRetryConnection` calls `setConnectionError(null)`
 * before invoking `createOrAttach`, the error is already cleared by the time the
 * first data packet arrives.  As a result every reconnect cycle permanently
 * consumes retry slots, and the retry budget is exhausted prematurely —
 * eventually leaving the terminal permanently stuck in the
 * "[Connection lost. Reconnecting...]" state with no way to recover.
 *
 * How the state machine works (Terminal.tsx):
 *
 *   1. connectionError changes to a non-null value
 *   2. useEffect fires:
 *      - if retryCount === 0: write "[Connection lost. Reconnecting...]"
 *      - retryCount++
 *      - setTimeout(handleRetryConnection, delay)
 *   3. handleRetryConnection runs:
 *      a. setConnectionError(null)    ← error cleared HERE
 *      b. createOrAttach(...)
 *         - onSuccess: setConnectionError(null) [no-op, already null]
 *                      retryCount is NOT reset here ← BUG
 *         - onError:   setConnectionError("...")  ← triggers step 2 again
 *
 *   Data from the terminal stream:
 *      - onData guard: if (connectionError && type==="data") → reset retryCount
 *      - Because the error is already cleared at step 3a, this guard NEVER fires
 *        on the data that arrives after a successful reconnect.
 *
 * Fix: reset retryCountRef.current = 0 whenever data arrives, regardless of
 * whether connectionError is currently set, so normal traffic always refreshes
 * the retry budget.
 */
import { describe, expect, it } from "bun:test";

// ---------------------------------------------------------------------------
// Model of the retry state machine (mirrors Terminal.tsx logic exactly)
// ---------------------------------------------------------------------------

const MAX_RETRIES = 5;

type RetryState = {
	retryCount: number;
	connectionError: string | null;
	/** Stash of messages written to the terminal (captures "[Connection lost...]") */
	terminalMessages: string[];
	/** Total number of retries that were scheduled */
	scheduledRetries: number;
};

function makeState(): RetryState {
	return {
		retryCount: 0,
		connectionError: null,
		terminalMessages: [],
		scheduledRetries: 0,
	};
}

/**
 * Simulate one firing of the auto-retry useEffect (Terminal.tsx).
 *
 * In production, this effect fires each time `connectionError` changes to a
 * non-null value.  Returns true if a retry was scheduled.
 */
function runRetryEffect(state: RetryState): boolean {
	if (!state.connectionError) return false;
	if (state.retryCount >= MAX_RETRIES) return false;

	if (state.retryCount === 0) {
		state.terminalMessages.push("[Connection lost. Reconnecting...]");
	}

	state.retryCount++;
	state.scheduledRetries++;
	return true;
}

/**
 * Simulate the stream subscription `onData` handler — current (buggy) behaviour.
 *
 * Current code: resets retryCount only when connectionError is truthy at the
 * moment data arrives.  Bug: handleRetryConnection clears the error *before*
 * createOrAttach completes, so by the time data arrives the error is already
 * null and the reset never fires.
 */
function onDataCurrent(state: RetryState): void {
	// Current (buggy) implementation: reset only when error is still set
	if (state.connectionError) {
		state.connectionError = null;
		state.retryCount = 0;
	}
}

/**
 * Simulate the stream subscription `onData` handler — with the proposed fix.
 *
 * Fix: reset retryCount unconditionally on every data event so that normal
 * terminal traffic always refreshes the retry budget, regardless of whether
 * the error had already been cleared by handleRetryConnection.
 */
function onDataFixed(state: RetryState): void {
	if (state.connectionError) {
		state.connectionError = null;
	}
	// Fix: always reset the retry budget on incoming data
	state.retryCount = 0;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("Terminal auto-retry — issue #2277", () => {
	// -------------------------------------------------------------------------
	// Basic retry mechanics
	// -------------------------------------------------------------------------

	it("shows reconnecting message on first error (retryCount===0)", () => {
		const state = makeState();
		state.connectionError = "Connection to terminal lost";
		runRetryEffect(state);
		expect(state.terminalMessages).toContain(
			"[Connection lost. Reconnecting...]",
		);
	});

	it("does NOT show reconnecting message on subsequent retries (retryCount>0)", () => {
		const state = makeState();
		state.retryCount = 1; // budget partially consumed
		state.connectionError = "Connection to terminal lost";
		runRetryEffect(state);
		expect(state.terminalMessages).toHaveLength(0);
	});

	it("stops retrying after MAX_RETRIES failures", () => {
		const state = makeState();

		for (let i = 0; i < MAX_RETRIES; i++) {
			state.connectionError = `error ${i}`;
			runRetryEffect(state);
		}
		expect(state.scheduledRetries).toBe(MAX_RETRIES);

		// Budget exhausted — next error must NOT schedule a retry
		state.connectionError = "one more error";
		const scheduled = runRetryEffect(state);
		expect(scheduled).toBe(false);
		expect(state.scheduledRetries).toBe(MAX_RETRIES);
	});

	it("resets retryCount when data arrives while connectionError is set (working path)", () => {
		const state = makeState();
		state.retryCount = 3;
		state.connectionError = "Connection failed";

		// Data arrives WHILE error is still set (handleRetryConnection hasn't run yet)
		onDataCurrent(state);

		expect(state.retryCount).toBe(0);
		expect(state.connectionError).toBeNull();
	});

	// -------------------------------------------------------------------------
	// Bug reproduction: retryCount not reset after successful reconnect
	// -------------------------------------------------------------------------

	/**
	 * REPRODUCTION TEST — demonstrates the current broken behaviour.
	 *
	 * In production the sequence is:
	 *   error → effect (retryCount++) → handleRetryConnection:
	 *     setConnectionError(null) ← error cleared here
	 *     createOrAttach fails → setConnectionError("err2")
	 *   → effect (retryCount++) → handleRetryConnection:
	 *     setConnectionError(null)
	 *     createOrAttach succeeds → data arrives
	 *     onData guard: connectionError is null → retryCount NOT reset ← BUG
	 */
	it("FAILS (bug): retryCount is not reset after a successful reconnect", () => {
		const state = makeState();

		// ── Error cycle 1 ─────────────────────────────────────────────────────
		// Step 1: initial connection error
		state.connectionError = "Connection to terminal lost";
		runRetryEffect(state); // retryCount: 0 → 1, "[Connection lost...]" shown
		expect(state.retryCount).toBe(1);

		// Step 2: handleRetryConnection clears error, createOrAttach fails
		state.connectionError = null; // setConnectionError(null) in handleRetryConnection
		state.connectionError = "Connection failed"; // createOrAttach onError
		runRetryEffect(state); // retryCount: 1 → 2
		expect(state.retryCount).toBe(2);

		// Step 3: handleRetryConnection clears error, createOrAttach succeeds
		state.connectionError = null; // setConnectionError(null) in handleRetryConnection
		// createOrAttach onSuccess — no error set
		// Data arrives AFTER error cleared: onData guard does NOT fire
		onDataCurrent(state);

		// BUG: retryCount should be 0 after success, but it is still 2
		expect(state.retryCount).toBe(2); // demonstrates the bug — should be 0

		// ── Error cycle 2: starts with a depleted budget ──────────────────────
		// Only 3 retries remain (MAX_RETRIES - 2 = 3) instead of the full 5

		state.connectionError = "Connection lost again";
		runRetryEffect(state); // retryCount: 2 → 3

		state.connectionError = null;
		state.connectionError = "retry 2 failed";
		runRetryEffect(state); // retryCount: 3 → 4

		state.connectionError = null;
		state.connectionError = "retry 3 failed";
		runRetryEffect(state); // retryCount: 4 → 5 → budget exhausted after only 3 more errors

		state.connectionError = "still failing";
		const canRetry = runRetryEffect(state);
		expect(canRetry).toBe(false); // permanently stuck!

		// Only 5 total retries used across TWO error episodes
		// (would be 5+5=10 if retryCount had been properly reset between episodes)
		expect(state.scheduledRetries).toBe(MAX_RETRIES);
	});

	// -------------------------------------------------------------------------
	// Fix verification: retryCount reset via onData fix
	// -------------------------------------------------------------------------

	/**
	 * PASSES (fix): onData always resets retryCount, regardless of whether
	 * connectionError was already cleared by handleRetryConnection.
	 */
	it("PASSES (fix): retryCount resets to 0 when data arrives after reconnect", () => {
		const state = makeState();

		// ── Error cycle 1 ─────────────────────────────────────────────────────
		state.connectionError = "Connection to terminal lost";
		runRetryEffect(state); // retryCount: 0 → 1

		state.connectionError = null;
		state.connectionError = "Connection failed";
		runRetryEffect(state); // retryCount: 1 → 2

		// Successful reconnect: error cleared, data arrives
		state.connectionError = null;
		onDataFixed(state); // FIX: resets retryCount unconditionally

		// FIXED: retryCount is now 0
		expect(state.retryCount).toBe(0);

		// ── Error cycle 2: starts with a fresh, full budget ───────────────────
		state.connectionError = "Connection lost again";
		runRetryEffect(state); // retryCount: 0 → 1
		expect(state.retryCount).toBe(1); // fresh budget!

		// All 5 retries available for the new error episode
		for (let i = 0; i < 4; i++) {
			state.connectionError = null;
			state.connectionError = `retry failed ${i}`;
			runRetryEffect(state);
		}
		expect(state.retryCount).toBe(MAX_RETRIES);

		// Stuck only after 5 failures in the NEW episode (not prematurely)
		state.connectionError = "still failing";
		const canRetry = runRetryEffect(state);
		expect(canRetry).toBe(false);

		// 7 total retries: 2 from cycle 1 + 5 from cycle 2
		expect(state.scheduledRetries).toBe(7);
	});
});
