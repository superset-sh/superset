import { describe, expect, mock, test } from "bun:test";
import { AckDataBufferer, FlowControlConstants } from "./flow-control";

// Upstream VSCode (terminalProcessManager.ts) ships `AckDataBufferer` without
// dedicated unit tests. The tests below pin the documented behavior so we
// notice if a future vendor refresh changes semantics.

describe("AckDataBufferer", () => {
	test("does not fire below CharCountAckSize", () => {
		const cb = mock();
		const bufferer = new AckDataBufferer(cb);
		bufferer.ack(100);
		bufferer.ack(1000);
		bufferer.ack(3899);
		expect(cb).not.toHaveBeenCalled();
	});

	test("does not fire at exactly CharCountAckSize (strictly-greater-than)", () => {
		// Upstream uses `while (count > CharCountAckSize)`, not `>=`.
		const cb = mock();
		const bufferer = new AckDataBufferer(cb);
		bufferer.ack(FlowControlConstants.CharCountAckSize);
		expect(cb).not.toHaveBeenCalled();
	});

	test("fires once when crossing CharCountAckSize by a single char", () => {
		const cb = mock();
		const bufferer = new AckDataBufferer(cb);
		bufferer.ack(FlowControlConstants.CharCountAckSize + 1);
		expect(cb).toHaveBeenCalledTimes(1);
		expect(cb).toHaveBeenCalledWith(FlowControlConstants.CharCountAckSize);
	});

	test("accumulates across multiple acks", () => {
		const cb = mock();
		const bufferer = new AckDataBufferer(cb);
		bufferer.ack(3000);
		expect(cb).not.toHaveBeenCalled();
		bufferer.ack(3000);
		expect(cb).toHaveBeenCalledTimes(1);
		expect(cb).toHaveBeenCalledWith(FlowControlConstants.CharCountAckSize);
	});

	test("fires multiple times for a single large ack", () => {
		const cb = mock();
		const bufferer = new AckDataBufferer(cb);
		// 15001 chars: 3 full batches of 5000 should drain.
		bufferer.ack(FlowControlConstants.CharCountAckSize * 3 + 1);
		expect(cb).toHaveBeenCalledTimes(3);
		for (let i = 0; i < 3; i++) {
			expect(cb).toHaveBeenNthCalledWith(
				i + 1,
				FlowControlConstants.CharCountAckSize,
			);
		}
	});

	test("always passes exactly CharCountAckSize to the callback (never partial)", () => {
		const cb = mock();
		const bufferer = new AckDataBufferer(cb);
		bufferer.ack(13_337);
		for (const call of cb.mock.calls) {
			expect(call[0]).toBe(FlowControlConstants.CharCountAckSize);
		}
	});

	test("retains leftover chars across multiple ack rounds", () => {
		const cb = mock();
		const bufferer = new AckDataBufferer(cb);
		// 7000 → 1 fire, 2000 left.
		bufferer.ack(7000);
		expect(cb).toHaveBeenCalledTimes(1);
		// 3001 → combined 5001 → 1 more fire.
		bufferer.ack(3001);
		expect(cb).toHaveBeenCalledTimes(2);
	});
});

describe("FlowControlConstants", () => {
	test("matches VSCode upstream values", () => {
		expect(FlowControlConstants.HighWatermarkChars).toBe(100_000);
		expect(FlowControlConstants.LowWatermarkChars).toBe(5_000);
		expect(FlowControlConstants.CharCountAckSize).toBe(5_000);
	});

	test("CharCountAckSize <= LowWatermarkChars (upstream invariant)", () => {
		// Documented in upstream source: "This must be less than or equal to
		// LowWatermarkChars or the terminal may never unpause."
		expect(FlowControlConstants.CharCountAckSize).toBeLessThanOrEqual(
			FlowControlConstants.LowWatermarkChars,
		);
	});
});
