import { expect, test } from "bun:test";
import type { ToolCall } from "@superset/chat/protocol";
import { toolTitle, toolTitleText } from "./toolTitle";

const tool: ToolCall = {
	id: "tool",
	kind: "tool_call",
	startedAtMs: 0,
	title: "Edit",
	toolKind: "edit",
	toolName: "edit",
	status: "completed",
	content: [
		{ type: "diff", path: "/project/login.ts", oldText: "old", newText: "new" },
	],
};

test("search and display share the translated file change label", () => {
	const translate = () => "Modifié";
	const title = toolTitle(tool, translate);
	expect(title.label).toBe("Modifié");
	expect(toolTitleText(tool, translate)).toBe(
		`${title.label} ${title.change?.name}`,
	);
});

test("a running terminal uses its displayed label", () => {
	expect(
		toolTitleText({
			...tool,
			title: "Terminal",
			toolKind: "execute",
			status: "running",
			content: [],
		}),
	).toBe("Running");
});

test("an installed plugin uses its displayed tool name", () => {
	const mcp: ToolCall = {
		...tool,
		title: "mcp__github__search",
		content: [],
		mcpServer: { name: "github", tool: "search" },
	};
	expect(toolTitleText(mcp, undefined, true)).toBe("search");
	expect(toolTitleText(mcp)).toBe("mcp__github__search");
});

test("a shell read is found by what the row shows, not the raw command", () => {
	const read: ToolCall = {
		...tool,
		title: "Running cat package.json",
		toolKind: "execute",
		content: [],
		rawInput: { command: "cat package.json" },
	};
	const title = toolTitle(read, () => "Read");
	expect(title.intent).toEqual({ verb: "read", path: "package.json" });
	expect(title.command).toBe(false);
	expect(toolTitleText(read, () => "Read")).toBe("Read package.json");
});

test("a command title is unwrapped and set as a command; a description is not", () => {
	const run: ToolCall = {
		...tool,
		title: "/bin/zsh -lc 'bun test'",
		toolKind: "execute",
		content: [],
		rawInput: { command: "/bin/zsh -lc 'bun test'" },
	};
	expect(toolTitle(run)).toMatchObject({ label: "bun test", command: true });
	expect(
		toolTitle({
			...run,
			title: "Run the unit tests",
			rawInput: { command: "bun test" },
		}),
	).toMatchObject({ label: "Run the unit tests", command: false });
});
