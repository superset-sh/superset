import { describe, expect, it } from "bun:test";
import type { MastraMessage } from "./message-dedupe";
import { reconcileStreamingCandidates } from "./use-messages";

function userMessage(id: string, text: string): MastraMessage {
	return {
		id,
		role: "user",
		content: [{ type: "text", text }],
		createdAt: new Date("2026-02-26T00:00:00.000Z"),
	} as unknown as MastraMessage;
}

function assistantMessage(id: string, text: string): MastraMessage {
	return {
		id,
		role: "assistant",
		content: [{ type: "text", text }],
		createdAt: new Date("2026-02-26T00:00:00.000Z"),
	} as unknown as MastraMessage;
}

describe("reconcileStreamingCandidates", () => {
	it("replaces historical assistant fragments in the active turn with currentMessage", () => {
		const reconciled = reconcileStreamingCandidates({
			historicalMessages: [
				userMessage("u_1", "call superset mcp"),
				assistantMessage("a_1", "Let me find..."),
			],
			optimisticMessage: null,
			currentMessage: assistantMessage("a_current", "\n\nLet me find..."),
			isRunning: true,
		});

		expect(reconciled.map((message) => message.id)).toEqual([
			"u_1",
			"a_current",
		]);
	});

	it("keeps prior completed turns intact while replacing active-turn assistant", () => {
		const reconciled = reconcileStreamingCandidates({
			historicalMessages: [
				userMessage("u_1", "first"),
				assistantMessage("a_1", "done"),
				userMessage("u_2", "second"),
				assistantMessage("a_2", "working"),
			],
			optimisticMessage: null,
			currentMessage: assistantMessage("a_current", "working more"),
			isRunning: true,
		});

		expect(reconciled.map((message) => message.id)).toEqual([
			"u_1",
			"a_1",
			"u_2",
			"a_current",
		]);
	});

	it("appends current assistant when no active-turn assistant exists yet", () => {
		const reconciled = reconcileStreamingCandidates({
			historicalMessages: [userMessage("u_1", "hello")],
			optimisticMessage: null,
			currentMessage: assistantMessage("a_current", "thinking"),
			isRunning: true,
		});

		expect(reconciled.map((message) => message.id)).toEqual([
			"u_1",
			"a_current",
		]);
	});

	it("updates existing assistant by id when currentMessage id is already present", () => {
		const reconciled = reconcileStreamingCandidates({
			historicalMessages: [
				userMessage("u_1", "hello"),
				assistantMessage("a_1", "before"),
			],
			optimisticMessage: null,
			currentMessage: assistantMessage("a_1", "after"),
			isRunning: true,
		});

		expect(reconciled.map((message) => message.id)).toEqual(["u_1", "a_1"]);
		expect(reconciled[1]?.content[0]).toEqual({ type: "text", text: "after" });
	});

	it("updates existing non-assistant message by id when present", () => {
		const reconciled = reconcileStreamingCandidates({
			historicalMessages: [userMessage("u_1", "before")],
			optimisticMessage: null,
			currentMessage: userMessage("u_1", "after"),
			isRunning: true,
		});

		expect(reconciled.map((message) => message.id)).toEqual(["u_1"]);
		expect(reconciled[0]?.content[0]).toEqual({ type: "text", text: "after" });
	});

	it("returns historical+optimistic unchanged when not running", () => {
		const reconciled = reconcileStreamingCandidates({
			historicalMessages: [userMessage("u_1", "hello")],
			optimisticMessage: userMessage("u_opt", "optimistic"),
			currentMessage: assistantMessage("a_current", "thinking"),
			isRunning: false,
		});

		expect(reconciled.map((message) => message.id)).toEqual(["u_1", "u_opt"]);
	});
});
