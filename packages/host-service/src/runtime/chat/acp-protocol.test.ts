import { describe, expect, test } from "bun:test";
import {
	appendAcpUpdateToDisplayState,
	createInitialDisplayState,
} from "./acp-protocol";

describe("appendAcpUpdateToDisplayState", () => {
	test("matches numeric tool ids across call and result updates", () => {
		const state = createInitialDisplayState();

		appendAcpUpdateToDisplayState({
			state,
			update: {
				sessionUpdate: "tool_call",
				toolCallId: 7,
				title: "read",
				rawInput: { path: "README.md" },
			},
		});
		appendAcpUpdateToDisplayState({
			state,
			update: {
				sessionUpdate: "tool_call_update",
				toolCallId: 7,
				status: "completed",
				rawOutput: "done",
			},
		});

		expect(state.currentMessage?.content).toEqual([
			{
				type: "tool_call",
				id: "7",
				name: "read",
				args: { path: "README.md" },
			},
			{ type: "tool_result", id: "7", name: "read", result: "done" },
		]);
		expect(state.activeTools.has("7")).toBe(false);
	});

	test("preserves tool input when progress updates omit replacement content", () => {
		const state = createInitialDisplayState();

		appendAcpUpdateToDisplayState({
			state,
			update: {
				sessionUpdate: "tool_call",
				toolCallId: "tool-1",
				title: "edit",
				rawInput: { path: "README.md" },
			},
		});
		appendAcpUpdateToDisplayState({
			state,
			update: {
				sessionUpdate: "tool_call_update",
				toolCallId: "tool-1",
				status: "in_progress",
			},
		});

		expect(state.activeTools.get("tool-1")).toEqual({
			toolCallId: "tool-1",
			state: "input-streaming",
			input: { path: "README.md" },
		});
	});
});
