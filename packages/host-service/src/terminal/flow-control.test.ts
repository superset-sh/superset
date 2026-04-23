import { describe, expect, test } from "bun:test";
import {
	clearUnacknowledged,
	createFlowControlState,
	FlowControlConstants,
	recordAck,
	recordOutput,
} from "./flow-control";

// Upstream VSCode (terminalProcess.ts) carries this logic inline without unit
// tests. These tests pin the documented behavior so a future vendor refresh
// surfaces any semantic drift.

describe("recordOutput", () => {
	test("does not request pause below HighWatermarkChars", () => {
		const state = createFlowControlState();
		const shouldPause = recordOutput(
			state,
			FlowControlConstants.HighWatermarkChars - 1,
		);
		expect(shouldPause).toBe(false);
		expect(state.isPaused).toBe(false);
	});

	test("does not request pause at exactly HighWatermarkChars (strictly-greater-than)", () => {
		// Upstream uses `> HighWatermarkChars`, not `>=`.
		const state = createFlowControlState();
		const shouldPause = recordOutput(
			state,
			FlowControlConstants.HighWatermarkChars,
		);
		expect(shouldPause).toBe(false);
		expect(state.isPaused).toBe(false);
	});

	test("requests pause once on crossing HighWatermarkChars", () => {
		const state = createFlowControlState();
		const shouldPause = recordOutput(
			state,
			FlowControlConstants.HighWatermarkChars + 1,
		);
		expect(shouldPause).toBe(true);
		expect(state.isPaused).toBe(true);
	});

	test("does not re-request pause while already paused", () => {
		const state = createFlowControlState();
		recordOutput(state, FlowControlConstants.HighWatermarkChars + 1);
		const shouldPauseAgain = recordOutput(state, 50_000);
		expect(shouldPauseAgain).toBe(false);
		expect(state.isPaused).toBe(true);
	});

	test("accumulates across multiple small outputs", () => {
		const state = createFlowControlState();
		for (let i = 0; i < 10; i++) {
			expect(recordOutput(state, 9_000)).toBe(false);
		}
		// 90k so far, still under.
		expect(state.unacknowledgedCharCount).toBe(90_000);
		expect(recordOutput(state, 10_001)).toBe(true);
	});
});

describe("recordAck", () => {
	test("does not request resume when not paused", () => {
		const state = createFlowControlState();
		state.unacknowledgedCharCount = 1_000;
		const shouldResume = recordAck(state, 500);
		expect(shouldResume).toBe(false);
		expect(state.isPaused).toBe(false);
		expect(state.unacknowledgedCharCount).toBe(500);
	});

	test("does not request resume when still above LowWatermarkChars", () => {
		const state = createFlowControlState();
		recordOutput(state, FlowControlConstants.HighWatermarkChars + 1);
		// Ack enough to go under HighWatermark but still above LowWatermark.
		const shouldResume = recordAck(state, 50_000);
		expect(shouldResume).toBe(false);
		expect(state.isPaused).toBe(true);
	});

	test("requests resume when dropping below LowWatermarkChars", () => {
		const state = createFlowControlState();
		recordOutput(state, FlowControlConstants.HighWatermarkChars + 1);
		const before = state.unacknowledgedCharCount;
		const shouldResume = recordAck(
			state,
			before - (FlowControlConstants.LowWatermarkChars - 1),
		);
		expect(shouldResume).toBe(true);
		expect(state.isPaused).toBe(false);
		expect(state.unacknowledgedCharCount).toBe(
			FlowControlConstants.LowWatermarkChars - 1,
		);
	});

	test("does not request resume at exactly LowWatermarkChars (strictly-less-than)", () => {
		// Upstream uses `< LowWatermarkChars`, not `<=`.
		const state = createFlowControlState();
		recordOutput(state, FlowControlConstants.HighWatermarkChars + 1);
		const before = state.unacknowledgedCharCount;
		const shouldResume = recordAck(
			state,
			before - FlowControlConstants.LowWatermarkChars,
		);
		expect(shouldResume).toBe(false);
		expect(state.isPaused).toBe(true);
	});

	test("clamps unacknowledgedCharCount at 0 on over-ack", () => {
		// Upstream comment: "Prevent lower than 0 to heal from errors".
		const state = createFlowControlState();
		state.unacknowledgedCharCount = 1_000;
		recordAck(state, 5_000);
		expect(state.unacknowledgedCharCount).toBe(0);
	});

	test("requests resume exactly once when draining past LowWatermarkChars", () => {
		const state = createFlowControlState();
		recordOutput(state, FlowControlConstants.HighWatermarkChars + 1);
		// First ack leaves us above LowWatermark — no resume.
		expect(recordAck(state, 90_000)).toBe(false);
		// Second ack crosses under — resume.
		expect(recordAck(state, 10_000)).toBe(true);
		// Subsequent acks must not fire resume again.
		expect(recordAck(state, 100)).toBe(false);
	});
});

describe("clearUnacknowledged", () => {
	test("resets count and requests resume when paused", () => {
		const state = createFlowControlState();
		recordOutput(state, FlowControlConstants.HighWatermarkChars + 1);
		const shouldResume = clearUnacknowledged(state);
		expect(shouldResume).toBe(true);
		expect(state.unacknowledgedCharCount).toBe(0);
		expect(state.isPaused).toBe(false);
	});

	test("resets count without requesting resume when not paused", () => {
		const state = createFlowControlState();
		state.unacknowledgedCharCount = 1_234;
		const shouldResume = clearUnacknowledged(state);
		expect(shouldResume).toBe(false);
		expect(state.unacknowledgedCharCount).toBe(0);
		expect(state.isPaused).toBe(false);
	});
});

describe("FlowControlConstants", () => {
	test("matches VSCode upstream values", () => {
		expect(FlowControlConstants.HighWatermarkChars).toBe(100_000);
		expect(FlowControlConstants.LowWatermarkChars).toBe(5_000);
		expect(FlowControlConstants.CharCountAckSize).toBe(5_000);
	});
});
