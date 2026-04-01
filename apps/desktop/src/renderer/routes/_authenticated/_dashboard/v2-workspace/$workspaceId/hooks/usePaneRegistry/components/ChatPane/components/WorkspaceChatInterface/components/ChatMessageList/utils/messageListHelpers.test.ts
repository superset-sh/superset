import { describe, expect, it } from "bun:test";
import { resolvePendingPlanToolCallId } from "./messageListHelpers";

describe("resolvePendingPlanToolCallId", () => {
	it("prefers explicit toolCallId when provided", () => {
		const result = resolvePendingPlanToolCallId({
			pendingPlanApproval: {
				toolCallId: "tool-call-explicit",
				planId: "plan-1",
			} as never,
			fallbackToolCallId: "tool-call-fallback",
		});

		expect(result).toBe("tool-call-explicit");
	});

	it("returns matching planId when it matches fallback", () => {
		const result = resolvePendingPlanToolCallId({
			pendingPlanApproval: {
				planId: "tool-call-fallback",
			} as never,
			fallbackToolCallId: "tool-call-fallback",
		});

		expect(result).toBe("tool-call-fallback");
	});

	it("falls back when no explicit id is available", () => {
		const result = resolvePendingPlanToolCallId({
			pendingPlanApproval: {
				title: "Approval required",
			} as never,
			fallbackToolCallId: "tool-call-fallback",
		});

		expect(result).toBe("tool-call-fallback");
	});
});
