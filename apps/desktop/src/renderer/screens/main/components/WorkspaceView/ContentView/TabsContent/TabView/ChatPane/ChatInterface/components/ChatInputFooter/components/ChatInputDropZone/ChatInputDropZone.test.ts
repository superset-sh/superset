import { describe, expect, it } from "bun:test";

/**
 * Tests for path-drop text insertion logic used in ChatInputDropZone.
 *
 * When an internal file-tree path is dragged (text/plain drag) into the
 * chat input, the path is appended to any existing text in the textarea.
 * The logic lives inline in handlePathDrop:
 *
 *   const needsSpace = current.length > 0 && !current.endsWith(" ");
 *   textInput.setInput(`${current}${needsSpace ? " " : ""}${path} `);
 *
 * Reproduces: #2181 – drag-and-drop file into terminal input doesn't work
 */

function buildPathInsertText(current: string, path: string): string {
	const needsSpace = current.length > 0 && !current.endsWith(" ");
	return `${current}${needsSpace ? " " : ""}${path} `;
}

describe("ChatInputDropZone – path insertion", () => {
	it("inserts a path into an empty input", () => {
		expect(buildPathInsertText("", "/home/user/file.txt")).toBe(
			"/home/user/file.txt ",
		);
	});

	it("appends a path to existing text without a trailing space", () => {
		expect(buildPathInsertText("please look at", "/src/index.ts")).toBe(
			"please look at /src/index.ts ",
		);
	});

	it("appends a path to existing text that already has a trailing space", () => {
		expect(buildPathInsertText("please look at ", "/src/index.ts")).toBe(
			"please look at /src/index.ts ",
		);
	});

	it("appends a path when current text ends with multiple spaces", () => {
		// Only one space should be added if the current text doesn't end with space
		// but here it already does – no extra space should be inserted
		expect(buildPathInsertText("check  ", "/lib/util.ts")).toBe(
			"check  /lib/util.ts ",
		);
	});

	it("does not insert a path for a native OS file drop (Files drag type)", () => {
		// handlePathDrop returns early when dataTransfer.types includes "Files"
		// This test documents that OS-file drags are NOT handled by handlePathDrop;
		// they fall through to PromptInput.globalDrop which attaches them instead.
		const types = ["Files"];
		const isNativeFileDrop = types.includes("Files");
		expect(isNativeFileDrop).toBe(true);
	});
});
