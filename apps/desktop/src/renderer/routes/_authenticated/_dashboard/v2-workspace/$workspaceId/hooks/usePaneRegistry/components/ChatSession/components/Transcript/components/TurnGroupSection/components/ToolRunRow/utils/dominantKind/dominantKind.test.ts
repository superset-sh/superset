import { describe, expect, test } from "bun:test";
import type { ToolCall, ToolKind } from "@superset/chat/protocol";
import { dominantKind } from "./dominantKind";

function call(toolKind: ToolKind): ToolCall {
	return {
		id: toolKind + Math.random(),
		kind: "tool_call",
		title: toolKind,
		toolKind,
		toolName: toolKind,
		status: "completed",
		content: [],
		startedAtMs: 0,
	};
}

describe("dominantKind", () => {
	test("picks the kind the run did most", () => {
		expect(dominantKind([call("read"), call("read"), call("execute")])).toBe(
			"read",
		);
	});

	test("breaks a tie toward the kind that changes more", () => {
		expect(dominantKind([call("read"), call("edit")])).toBe("edit");
	});
});
