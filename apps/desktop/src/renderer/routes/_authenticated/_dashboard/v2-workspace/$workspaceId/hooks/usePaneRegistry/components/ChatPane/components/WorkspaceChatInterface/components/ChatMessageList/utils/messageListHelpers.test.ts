import { describe, expect, it } from "bun:test";
import {
	getCurrentAssistantMessage,
	resolvePendingPlanToolCallId,
} from "./messageListHelpers";

function textMessage(role: "user" | "assistant") {
	return {
		id: `${role}-1`,
		role,
		content: [{ type: "text", text: "hello" }],
		createdAt: new Date("2026-05-31T00:00:00.000Z"),
	} as never;
}

describe("getCurrentAssistantMessage", () => {
	it("ignores transient user currentMessage values", () => {
		expect(getCurrentAssistantMessage(textMessage("user"))).toBeNull();
	});

	it("returns assistant currentMessage values", () => {
		const assistant = textMessage("assistant");
		expect(getCurrentAssistantMessage(assistant)).toBe(assistant);
	});
});

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
