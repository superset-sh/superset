import { describe, expect, it } from "bun:test";
import {
	type AssistantTurnSummary,
	formatTurnSummary,
	summarizeAssistantTurn,
} from "./group-assistant-turn";

describe("summarizeAssistantTurn", () => {
	it("counts tools, thinking, and intermediate outputs", () => {
		const summary = summarizeAssistantTurn([
			{ type: "thinking" },
			{ type: "text" }, // intermediate narration
			{ type: "tool_call", id: "a" },
			{ type: "tool_result", id: "a" },
			{ type: "tool_call", id: "b" },
			{ type: "tool_result", id: "b" },
			{ type: "text" }, // final answer
		] as never);

		expect(summary.thinkingCount).toBe(1);
		expect(summary.toolCount).toBe(2);
		expect(summary.outputCount).toBe(1);
		expect(summary.lastTextIndex).toBe(6);
		expect(summary.hasSteps).toBe(true);
		expect(summary.status).toBe("complete");
	});

	it("does not double-count a tool_call and its tool_result", () => {
		const summary = summarizeAssistantTurn([
			{ type: "tool_call", id: "x" },
			{ type: "tool_result", id: "x" },
		] as never);
		expect(summary.toolCount).toBe(1);
	});

	it("counts an orphaned tool_result as one tool", () => {
		const summary = summarizeAssistantTurn([
			{ type: "tool_result", id: "orphan" },
		] as never);
		expect(summary.toolCount).toBe(1);
	});

	it("counts subagent tool calls separately from regular tools", () => {
		const summary = summarizeAssistantTurn([
			{ type: "tool_call", id: "a", name: "read_file" },
			{ type: "tool_result", id: "a" },
			{ type: "tool_call", id: "b", name: "subagent" },
			{ type: "tool_result", id: "b" },
		] as never);
		expect(summary.toolCount).toBe(1);
		expect(summary.subagentCount).toBe(1);
	});

	it("reports error status when any tool_result errored", () => {
		const summary = summarizeAssistantTurn([
			{ type: "tool_call", id: "a" },
			{ type: "tool_result", id: "a", isError: true },
		] as never);
		expect(summary.status).toBe("error");
	});

	it("reports error status when the message itself errored", () => {
		const summary = summarizeAssistantTurn(
			[
				{ type: "tool_call", id: "a" },
				{ type: "tool_result", id: "a" },
			] as never,
			{ errored: true },
		);
		expect(summary.status).toBe("error");
	});

	it("reports in_progress while streaming regardless of errors", () => {
		const summary = summarizeAssistantTurn(
			[
				{ type: "tool_call", id: "a" },
				{ type: "tool_result", id: "a", isError: true },
			] as never,
			{ isStreaming: true },
		);
		expect(summary.status).toBe("in_progress");
	});

	it("marks pure-text turns as having no steps", () => {
		const summary = summarizeAssistantTurn([{ type: "text" }] as never);
		expect(summary.hasSteps).toBe(false);
		expect(summary.lastTextIndex).toBe(0);
	});
});

describe("formatTurnSummary", () => {
	const base: AssistantTurnSummary = {
		thinkingCount: 0,
		toolCount: 0,
		subagentCount: 0,
		outputCount: 0,
		imageCount: 0,
		status: "complete",
		lastTextIndex: -1,
		hasSteps: false,
	};

	it("pluralizes correctly", () => {
		expect(formatTurnSummary({ ...base, toolCount: 1 })).toBe("1 tool call");
		expect(formatTurnSummary({ ...base, toolCount: 3 })).toBe("3 tool calls");
	});

	it("joins segments with a middot in a stable order", () => {
		expect(
			formatTurnSummary({
				...base,
				thinkingCount: 2,
				toolCount: 3,
				subagentCount: 1,
				outputCount: 1,
			}),
		).toBe("2 reasonings · 3 tool calls · 1 subagent · 1 message");
	});

	it("returns empty string when nothing notable", () => {
		expect(formatTurnSummary(base)).toBe("");
	});
});
