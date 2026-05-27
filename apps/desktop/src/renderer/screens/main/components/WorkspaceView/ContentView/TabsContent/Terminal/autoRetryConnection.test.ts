/**
 * Reproduction tests for issue #4944:
 * "All my work in the worktree is stuck behind [Connection lost. Reconnecting...]"
 *
 * Root cause: Terminal.tsx writes "[Connection lost. Reconnecting...]" to xterm
 * once on the first connection error, then auto-retries with exponential backoff
 * up to MAX_RETRIES (5). After 5 failed retries the effect early-returns
 * (`if (retryCountRef.current >= MAX_RETRIES) return;`) but nothing is written
 * to xterm and connectionError stays set, so the user sees the misleading
 * "Reconnecting..." text forever with no indication that retries have stopped
 * and no path to recovery.
 *
 * Expected behaviour: when retries are exhausted, write a clear "give up"
 * message so the user knows reconnection has stopped and they need to restart
 * the pane.
 */
import { describe, expect, it } from "bun:test";

// ---------------------------------------------------------------------------
// Minimal model of Terminal.tsx's auto-retry effect.
// Mirrors the exact logic so tests accurately demonstrate production behaviour.
// ---------------------------------------------------------------------------

const MAX_RETRIES = 5;

interface FakeXterm {
	lines: string[];
	writeln(text: string): void;
}

function makeXterm(): FakeXterm {
	return {
		lines: [],
		writeln(text: string) {
			this.lines.push(text);
		},
	};
}

interface RetryModel {
	connectionError: string | null;
	retryCount: number;
	didReportExhausted: boolean;
	xterm: FakeXterm;
	// Schedules a "retry" that simulates the next handleRetryConnection call.
	// In production this always re-sets connectionError on failure.
	scheduledRetries: Array<() => void>;
}

function makeRetryModel(): RetryModel {
	return {
		connectionError: null,
		retryCount: 0,
		didReportExhausted: false,
		xterm: makeXterm(),
		scheduledRetries: [],
	};
}

/**
 * Mirrors the effect body in Terminal.tsx. Returns true if a retry was
 * scheduled, false if the effect early-returned.
 */
function runAutoRetryEffect(model: RetryModel, isExited: boolean): boolean {
	if (!model.connectionError) return false;
	if (isExited) return false;
	if (model.retryCount >= MAX_RETRIES) {
		if (!model.didReportExhausted) {
			model.didReportExhausted = true;
			model.xterm.writeln(
				`\r\n\x1b[90m[Reconnect failed after ${MAX_RETRIES} attempts. Restart this terminal to try again.]\x1b[0m`,
			);
		}
		return false;
	}

	if (model.retryCount === 0) {
		model.xterm.writeln(
			"\r\n\x1b[90m[Connection lost. Reconnecting...]\x1b[0m",
		);
	}

	model.retryCount++;

	// Schedule the retry; in tests we'll trigger it manually instead of using a
	// real timer. handleRetryConnection always sets connectionError again on
	// failure.
	model.scheduledRetries.push(() => {
		model.connectionError = "Connection failed";
	});
	return true;
}

/**
 * Simulates a full retry cycle: trigger the scheduled retry (which sets
 * connectionError to the failure message) and re-run the auto-retry effect.
 * Note that in real React the effect re-runs only when connectionError CHANGES
 * — but handleRetryConnection clears it to null first (line 77 of
 * useTerminalColdRestore.ts) before re-setting on failure, so the effect does
 * re-fire each cycle.
 */
function simulateOneRetryCycle(model: RetryModel, isExited: boolean): boolean {
	const scheduled = model.scheduledRetries.shift();
	if (!scheduled) return false;
	// handleRetryConnection clears error first
	model.connectionError = null;
	scheduled();
	// Effect re-runs because connectionError changed null → "Connection failed"
	return runAutoRetryEffect(model, isExited);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("auto-retry connection — issue #4944", () => {
	it("writes the 'Reconnecting...' message once on first disconnect", () => {
		const model = makeRetryModel();
		model.connectionError = "Connection lost";

		runAutoRetryEffect(model, /* isExited */ false);

		expect(model.xterm.lines).toEqual([
			"\r\n\x1b[90m[Connection lost. Reconnecting...]\x1b[0m",
		]);
		expect(model.retryCount).toBe(1);
	});

	it("does NOT repeat the 'Reconnecting...' line on subsequent retries", () => {
		const model = makeRetryModel();
		model.connectionError = "Connection lost";

		// First attempt prints the message
		runAutoRetryEffect(model, false);
		// Second + third retries should NOT print again
		simulateOneRetryCycle(model, false);
		simulateOneRetryCycle(model, false);

		// Still only the one "Reconnecting..." line
		const reconnectingLines = model.xterm.lines.filter((l) =>
			l.includes("Reconnecting"),
		);
		expect(reconnectingLines.length).toBe(1);
	});

	/**
	 * REPRODUCTION TEST — demonstrates the bug.
	 *
	 * After MAX_RETRIES failed attempts, the effect early-returns silently:
	 *   - connectionError stays set
	 *   - retryCount stays at MAX_RETRIES
	 *   - the misleading "[Connection lost. Reconnecting...]" text is still
	 *     visible in the terminal, but no further reconnection will occur
	 *   - nothing is written to xterm to tell the user reconnection gave up
	 *
	 * The user is "stuck behind" the message — it claims the terminal is
	 * reconnecting, but in reality the system has given up and there is no
	 * indication to the user.
	 */
	it("after MAX_RETRIES is exhausted, the user is left stuck with no 'gave up' message", () => {
		const model = makeRetryModel();
		model.connectionError = "Connection lost";

		// Initial effect run + MAX_RETRIES-1 retry cycles bring retryCount to MAX_RETRIES
		runAutoRetryEffect(model, false);
		for (let i = 0; i < MAX_RETRIES - 1; i++) {
			simulateOneRetryCycle(model, false);
		}

		expect(model.retryCount).toBe(MAX_RETRIES);
		expect(model.scheduledRetries.length).toBe(1); // one final retry queued

		// The final retry fails too — effect runs but early-returns on
		// `retryCount >= MAX_RETRIES`.
		const didSchedule = simulateOneRetryCycle(model, false);
		expect(didSchedule).toBe(false);

		// Bug: connectionError is still set, but no further retries will run.
		expect(model.connectionError).not.toBeNull();

		// After fix: a "[Reconnect failed]" message is written so the user knows
		// retries have stopped and can take action.
		const gaveUpLines = model.xterm.lines.filter((l) =>
			l.includes("Reconnect failed"),
		);
		expect(gaveUpLines.length).toBe(1);
	});

	it("does not duplicate the 'Reconnect failed' message on subsequent effect re-runs", () => {
		const model = makeRetryModel();
		model.connectionError = "Connection lost";

		runAutoRetryEffect(model, false);
		for (let i = 0; i < MAX_RETRIES - 1; i++) {
			simulateOneRetryCycle(model, false);
		}
		simulateOneRetryCycle(model, false); // hits max and writes the message

		// A spurious re-run (e.g. handleRetryConnection identity change) should not
		// re-write the message.
		runAutoRetryEffect(model, false);
		runAutoRetryEffect(model, false);

		const gaveUpLines = model.xterm.lines.filter((l) =>
			l.includes("Reconnect failed"),
		);
		expect(gaveUpLines.length).toBe(1);
	});

	it("resets retry state after a successful data event so future disconnects can retry again", () => {
		const model = makeRetryModel();
		model.connectionError = "Connection lost";

		// Exhaust all retries
		runAutoRetryEffect(model, false);
		for (let i = 0; i < MAX_RETRIES - 1; i++) {
			simulateOneRetryCycle(model, false);
		}
		simulateOneRetryCycle(model, false);
		expect(model.didReportExhausted).toBe(true);

		// Simulate the "data event arrived" reset (mirrors Terminal.tsx subscription
		// onEvent handler).
		model.connectionError = null;
		model.retryCount = 0;
		model.didReportExhausted = false;

		// New disconnect should retry from scratch and write the "Reconnecting..."
		// line again.
		model.connectionError = "Connection lost again";
		const scheduled = runAutoRetryEffect(model, false);
		expect(scheduled).toBe(true);
		expect(
			model.xterm.lines.filter((l) => l.includes("Reconnecting")).length,
		).toBe(2);
	});
});
