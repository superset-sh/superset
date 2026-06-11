import { describe, expect, it } from "bun:test";
import {
	getActiveTurnKey,
	getCurrentAssistantMessage,
	resolvePendingPlanToolCallId,
} from "./messageListHelpers";

type TestMessage = {
	id: string;
	role: "user" | "assistant";
	content: Array<
		| { type: "text"; text: string }
		| { type: "file"; data: string; mediaType: string }
	>;
	createdAt: Date;
};

function textMessage(role: "user" | "assistant"): TestMessage {
	return {
		id: `${role}-1`,
		role,
		content: [{ type: "text", text: "hello" }],
		createdAt: new Date("2026-05-31T00:00:00.000Z"),
	};
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

describe("getActiveTurnKey", () => {
	it("uses user text instead of the message id so optimistic-to-persisted swaps keep the streaming assistant mounted", () => {
		const optimistic = {
			...textMessage("user"),
			id: "optimistic-1",
			content: [{ type: "text", text: "same prompt" }],
		} as never;
		const persisted = {
			...textMessage("user"),
			id: "persisted-1",
			content: [{ type: "text", text: "same prompt" }],
		} as never;

		expect(getActiveTurnKey([optimistic])).toBe(getActiveTurnKey([persisted]));
	});

	it("falls back to the latest user message id when there is no text content", () => {
		const fileOnly = {
			...textMessage("user"),
			id: "file-message-1",
			content: [
				{
					type: "file",
					data: "file:///tmp/example.txt",
					mediaType: "text/plain",
				},
			],
		} as never;

		expect(getActiveTurnKey([fileOnly])).toBe("message:file-message-1");
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
