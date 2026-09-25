import { describe, expect, test } from "bun:test";
import type { Item } from "@superset/chat/protocol";
import { rowKindForItem } from "./rowKind";

const base = { id: "i1", startedAtMs: 1 };

describe("rowKindForItem", () => {
	test("dispatches every known item kind to its row", () => {
		const cases: Array<[Item, string]> = [
			[{ ...base, kind: "user_message", content: [] }, "user_message"],
			[{ ...base, kind: "agent_message", text: "" }, "agent_message"],
			[{ ...base, kind: "reasoning", text: "" }, "reasoning"],
			[
				{
					...base,
					kind: "tool_call",
					title: "ls",
					toolKind: "execute",
					toolName: "Bash",
					status: "running",
					content: [],
				},
				"tool_call",
			],
			[{ ...base, kind: "plan", entries: [] }, "plan"],
			[
				{
					...base,
					kind: "approval_request",
					targetItemId: null,
					title: "Allow?",
					status: "pending",
				},
				"approval_request",
			],
			[{ ...base, kind: "notice", noticeKind: "info" }, "notice"],
		];
		for (const [item, expected] of cases) {
			expect(rowKindForItem(item)).toBe(expected as never);
		}
	});

	test("routes open-union kinds to the unknown row", () => {
		expect(rowKindForItem({ ...base, kind: "hologram" })).toBe("unknown");
	});
});
