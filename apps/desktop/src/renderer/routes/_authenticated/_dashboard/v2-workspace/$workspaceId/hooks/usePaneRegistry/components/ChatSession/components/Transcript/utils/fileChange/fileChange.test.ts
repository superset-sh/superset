import { describe, expect, test } from "bun:test";
import type { ToolCall } from "@superset/chat/protocol";
import {
	changedPaths,
	fileChangeKind,
	fileChangeOf,
	fileName,
} from "./fileChange";

function call(
	content: ToolCall["content"],
	toolKind: ToolCall["toolKind"] = "edit",
): ToolCall {
	return {
		id: "toolu_1",
		kind: "tool_call",
		title: "Write /repo/packages/chat/README.md",
		toolKind,
		toolName: "Write",
		status: "completed",
		startedAtMs: 1,
		content,
	};
}

describe("fileName", () => {
	test("keeps the last segment of an absolute path", () => {
		expect(fileName("/Users/x/repo/packages/chat/README.md")).toBe("README.md");
	});
	test("tolerates a trailing slash and windows separators", () => {
		expect(fileName("C:\\repo\\src\\index.ts")).toBe("index.ts");
		expect(fileName("packages/chat/")).toBe("chat");
	});
	test("returns a bare name unchanged", () => {
		expect(fileName("README.md")).toBe("README.md");
	});
});

describe("fileChangeKind", () => {
	test("a missing old text is a new file", () => {
		expect(
			fileChangeKind(
				{ type: "diff", path: "a", oldText: null, newText: "x" },
				"edit",
			),
		).toBe("added");
	});
	test("a delete call is a deletion whatever its diff says", () => {
		expect(
			fileChangeKind(
				{ type: "diff", path: "a", oldText: "x", newText: "" },
				"delete",
			),
		).toBe("deleted");
	});
	test("an edit that empties a file is still an edit", () => {
		expect(
			fileChangeKind(
				{ type: "diff", path: "a", oldText: "x", newText: "" },
				"edit",
			),
		).toBe("modified");
		expect(
			fileChangeKind(
				{ type: "diff", path: "a", oldText: "x", newText: "y" },
				"edit",
			),
		).toBe("modified");
	});
});

describe("fileChangeOf", () => {
	test("reads the first diff a call carries", () => {
		expect(
			fileChangeOf(
				call([
					{ type: "text", text: "ok" },
					{ type: "diff", path: "/repo/src/a.ts", oldText: "1", newText: "2" },
				]),
			),
		).toEqual({ kind: "modified", path: "/repo/src/a.ts", name: "a.ts" });
	});
	test("is null for a call without a diff", () => {
		expect(fileChangeOf(call([{ type: "text", text: "ok" }]))).toBeNull();
	});
	test("is null for a patch that touches several files", () => {
		expect(
			fileChangeOf(
				call([
					{ type: "diff", path: "/repo/src/a.ts", oldText: "1", newText: "2" },
					{ type: "diff", path: "/repo/src/b.ts", oldText: "1", newText: "2" },
				]),
			),
		).toBeNull();
	});
	test("names a delete call's file as deleted", () => {
		expect(
			fileChangeOf(
				call(
					[{ type: "diff", path: "/repo/src/a.ts", oldText: "1", newText: "" }],
					"delete",
				),
			),
		).toEqual({ kind: "deleted", path: "/repo/src/a.ts", name: "a.ts" });
	});
	test("is null for a move, whose title names both paths", () => {
		expect(
			fileChangeOf(
				call(
					[
						{
							type: "diff",
							path: "/repo/src/b.ts",
							oldText: "1",
							newText: "1",
						},
					],
					"move",
				),
			),
		).toBeNull();
	});
});

describe("changedPaths", () => {
	test("names each path once, in order of first appearance", () => {
		expect(
			changedPaths(
				call([
					{ type: "diff", path: "/repo/src/a.ts", oldText: "1", newText: "2" },
					{ type: "text", text: "ok" },
					{ type: "diff", path: "/repo/src/b.ts", oldText: null, newText: "2" },
					{ type: "diff", path: "/repo/src/a.ts", oldText: "2", newText: "3" },
				]),
			),
		).toEqual(["/repo/src/a.ts", "/repo/src/b.ts"]);
	});
});
