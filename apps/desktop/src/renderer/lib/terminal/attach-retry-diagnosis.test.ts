import { describe, expect, test } from "bun:test";
import {
	clearAttachRetryableMessage,
	createAttachRetryState,
	DIAGNOSE_AFTER_ATTEMPTS,
	effectiveFailureCount,
	noteAttachRetryableMessage,
	recordFailedConnection,
	resetAttachRetryState,
	shouldSurfaceDiagnosis,
} from "./attach-retry-diagnosis";

describe("attach-retry diagnosis tracking", () => {
	test("N never-attached connections surface the diagnosis even though partysocket retryCount stays reset", () => {
		const state = createAttachRetryState();
		// Wedged-daemon cycle: each failed attempt held a >5s "stable" WS
		// (upgrade OK, then the host's daemon-open timeout), so partysocket's
		// minUptime logic pins retryCount at 0/1 forever.
		const socketRetryCount = 1;
		for (let i = 0; i < DIAGNOSE_AFTER_ATTEMPTS - 1; i++) {
			noteAttachRetryableMessage(state, "daemon open x: timed out");
			recordFailedConnection(state);
			expect(shouldSurfaceDiagnosis(state, socketRetryCount)).toBe(false);
		}
		noteAttachRetryableMessage(state, "daemon open x: timed out");
		recordFailedConnection(state);
		expect(shouldSurfaceDiagnosis(state, socketRetryCount)).toBe(true);
		expect(state.lastMessage).toBe("daemon open x: timed out");
	});

	test("silent closes (no error frame) count too — the >5s-held-then-closed blind spot", () => {
		const state = createAttachRetryState();
		for (let i = 0; i < DIAGNOSE_AFTER_ATTEMPTS; i++) {
			recordFailedConnection(state);
		}
		expect(shouldSurfaceDiagnosis(state, 0)).toBe(true);
		expect(state.lastMessage).toBeNull();
	});

	test("a failure-mode switch clears the stale daemon message so the probe classification wins", () => {
		const state = createAttachRetryState();
		// Brief wedge: retryable rejections with a daemon message...
		for (let i = 0; i < 3; i++) {
			noteAttachRetryableMessage(state, "daemon open x: timed out");
			recordFailedConnection(state);
		}
		// ...then the host goes fully down: closes arrive with no error frame.
		for (let i = 0; i < DIAGNOSE_AFTER_ATTEMPTS; i++) {
			clearAttachRetryableMessage(state);
			recordFailedConnection(state);
		}
		expect(shouldSurfaceDiagnosis(state, 0)).toBe(true);
		expect(state.lastMessage).toBeNull();
	});

	test("a real attach resets the streak and the stored reason", () => {
		const state = createAttachRetryState();
		for (let i = 0; i < DIAGNOSE_AFTER_ATTEMPTS + 3; i++) {
			noteAttachRetryableMessage(state, "stalled");
			recordFailedConnection(state);
		}
		expect(shouldSurfaceDiagnosis(state, 0)).toBe(true);
		resetAttachRetryState(state);
		expect(shouldSurfaceDiagnosis(state, 0)).toBe(false);
		expect(state.lastMessage).toBeNull();
	});

	test("dial-level failures still count via partysocket retryCount", () => {
		const state = createAttachRetryState();
		expect(effectiveFailureCount(state, 12)).toBe(12);
		expect(shouldSurfaceDiagnosis(state, DIAGNOSE_AFTER_ATTEMPTS)).toBe(true);
	});
});
