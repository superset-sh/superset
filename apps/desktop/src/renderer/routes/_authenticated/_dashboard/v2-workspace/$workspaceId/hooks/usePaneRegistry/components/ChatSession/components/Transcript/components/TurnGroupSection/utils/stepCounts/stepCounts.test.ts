import { describe, expect, test } from "bun:test";
import type { ToolCall, ToolKind } from "@superset/chat/protocol";
import { stepCounts } from "./stepCounts";

function call(toolKind: ToolKind, content: ToolCall["content"] = []): ToolCall {
	return {
		id: `t-${Math.random()}`,
		kind: "tool_call",
		title: toolKind,
		toolKind,
		toolName: toolKind,
		status: "completed",
		startedAtMs: 1,
		content,
	};
}

function diff(path: string): ToolCall["content"][number] {
	return { type: "diff", path, oldText: "a", newText: "b" };
}

describe("stepCounts", () => {
	test("folds tool kinds into the concepts a reader cares about", () => {
		expect(
			stepCounts([
				call("execute"),
				call("execute"),
				call("edit"),
				call("delete"),
				call("move"),
				call("read"),
				call("search"),
				call("fetch"),
				call("think"),
				call("other"),
			]),
		).toEqual({
			commands: 2,
			edits: 3,
			reads: 1,
			searches: 1,
			fetches: 1,
			tools: 2,
		});
	});
	test("counts the files a step touches, not its calls", () => {
		expect(
			stepCounts([
				call("edit", [
					diff("/repo/a.ts"),
					diff("/repo/b.ts"),
					diff("/repo/a.ts"),
				]),
				call("edit", [diff("/repo/c.ts")]),
				call("edit", [diff("/repo/a.ts")]),
				call("delete"),
			]).edits,
		).toBe(4);
	});
	test("is all zeros for an empty run", () => {
		expect(stepCounts([])).toEqual({
			commands: 0,
			edits: 0,
			reads: 0,
			searches: 0,
			fetches: 0,
			tools: 0,
		});
	});
});
