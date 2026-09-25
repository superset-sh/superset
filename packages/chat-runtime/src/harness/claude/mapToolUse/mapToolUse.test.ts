import { describe, expect, test } from "bun:test";
import { contentFor, locationsFor, titleFor, toolKindFor } from "./mapToolUse";

const CWD = "/repo";

function use(name: string, input: Record<string, unknown> = {}) {
	return { id: "toolu_1", name, input };
}

describe("toolKindFor", () => {
	test("dispatches renderers on kind, not on tool name", () => {
		expect(toolKindFor("Read")).toBe("read");
		expect(toolKindFor("Edit")).toBe("edit");
		expect(toolKindFor("Write")).toBe("edit");
		expect(toolKindFor("Bash")).toBe("execute");
		expect(toolKindFor("Grep")).toBe("search");
		expect(toolKindFor("WebFetch")).toBe("fetch");
		expect(toolKindFor("Agent")).toBe("other");
		expect(toolKindFor("SomethingNew")).toBe("other");
	});
});

describe("titleFor", () => {
	test("relativizes paths inside the workspace and basenames the rest", () => {
		expect(titleFor(use("Read", { file_path: "/repo/src/a.ts" }), CWD)).toBe(
			"Reading src/a.ts",
		);
		expect(titleFor(use("Edit", { file_path: "/elsewhere/b.ts" }), CWD)).toBe(
			"Editing b.ts",
		);
		expect(titleFor(use("Write", { file_path: "/repo/new.ts" }), CWD)).toBe(
			"Creating new.ts",
		);
	});

	test("prefers the harness-supplied description for shell commands", () => {
		expect(
			titleFor(
				use("Bash", { command: "ls -la", description: "List files" }),
				CWD,
			),
		).toBe("List files");
		expect(titleFor(use("Bash", { command: "ls -la" }), CWD)).toBe(
			"Running ls -la",
		);
	});

	test("falls back to the tool name for unknown tools", () => {
		expect(titleFor(use("SomethingNew"), CWD)).toBe("SomethingNew");
	});
});

describe("contentFor", () => {
	test("builds a diff from the edit result's original file", () => {
		const content = contentFor(use("Edit", { file_path: "/repo/note.txt" }), {
			rawOutput: {
				filePath: "/repo/note.txt",
				originalFile: "alpha foo omega\n",
				oldString: "foo",
				newString: "bar",
				replaceAll: false,
			},
			modelFacingText: "updated",
			isError: false,
		});

		expect(content).toEqual([
			{
				type: "diff",
				path: "/repo/note.txt",
				oldText: "alpha foo omega\n",
				newText: "alpha bar omega\n",
			},
		]);
	});

	test("treats a write as a creation diff with null oldText", () => {
		expect(
			contentFor(
				use("Write", { file_path: "/repo/new.txt", content: "hi" }),
				null,
			),
		).toEqual([
			{ type: "diff", path: "/repo/new.txt", oldText: null, newText: "hi" },
		]);
	});

	test("joins stdout and stderr into terminal content", () => {
		expect(
			contentFor(use("Bash", { command: "echo hi" }), {
				rawOutput: { stdout: "hi", stderr: "warn" },
				modelFacingText: "hi",
				isError: false,
			}),
		).toEqual([{ type: "terminal", command: "echo hi", output: "hi\nwarn" }]);
	});

	test("falls back to the model-facing text for unmapped tools", () => {
		expect(
			contentFor(use("Read", { file_path: "/repo/a.ts" }), {
				rawOutput: { file: {}, type: "text" },
				modelFacingText: "1\tcontents",
				isError: false,
			}),
		).toEqual([{ type: "text", text: "1\tcontents" }]);
	});

	test("returns no content when an edit has no recorded original", () => {
		expect(contentFor(use("Edit", { file_path: "/repo/a.ts" }), null)).toEqual(
			[],
		);
	});

	test("applies every MultiEdit step in order, not the top-level strings", () => {
		const content = contentFor(
			{
				id: "toolu_1",
				name: "MultiEdit",
				input: {
					file_path: "/repo/note.txt",
					edits: [
						{ old_string: "one", new_string: "1" },
						{ old_string: "two", new_string: "2" },
						{ old_string: "x", new_string: "y", replace_all: true },
					],
				},
			},
			{
				rawOutput: {
					filePath: "/repo/note.txt",
					originalFile: "one two x x\n",
				},
				modelFacingText: "updated",
				isError: false,
			},
		);

		expect(content).toEqual([
			{
				type: "diff",
				path: "/repo/note.txt",
				oldText: "one two x x\n",
				newText: "1 2 y y\n",
			},
		]);
	});

	test("renders a subagent report but never its internal metadata", () => {
		const metadata = {
			agentId: "a1f0309f3871e6a02",
			outputFile: "/workspace/.agent/out.json",
			status: "running",
		};

		expect(
			contentFor(
				{ id: "toolu_1", name: "Agent", input: {} },
				{
					rawOutput: metadata,
					modelFacingText:
						"Async agent launched successfully. agentId: a1f0309f3871e6a02",
					isError: false,
				},
			),
		).toEqual([]);

		expect(
			contentFor(
				{ id: "toolu_1", name: "Agent", input: {} },
				{
					rawOutput: { ...metadata, report: "ping" },
					modelFacingText: "internal metadata",
					isError: false,
				},
			),
		).toEqual([{ type: "text", text: "ping" }]);
	});
});

describe("locationsFor", () => {
	test("exposes the file path as a follow-along location", () => {
		expect(locationsFor(use("Read", { file_path: "/repo/a.ts" }))).toEqual([
			{ path: "/repo/a.ts" },
		]);
		expect(locationsFor(use("Bash", { command: "ls" }))).toBeUndefined();
	});
});
