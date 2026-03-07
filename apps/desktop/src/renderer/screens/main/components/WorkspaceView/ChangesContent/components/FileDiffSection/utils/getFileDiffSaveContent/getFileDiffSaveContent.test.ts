import { describe, expect, it } from "bun:test";
import { getFileDiffSaveContent } from "./getFileDiffSaveContent";

describe("getFileDiffSaveContent", () => {
	it("prefers the live editor value over stale React state", () => {
		expect(
			getFileDiffSaveContent({
				editorValue: "latest change",
				editedContent: "one change behind",
				modifiedContent: "original value",
			}),
		).toBe("latest change");
	});

	it("falls back to edited state when no editor ref is available", () => {
		expect(
			getFileDiffSaveContent({
				editorValue: undefined,
				editedContent: "edited value",
				modifiedContent: "original value",
			}),
		).toBe("edited value");
	});

	it("falls back to the diff content when nothing has been edited yet", () => {
		expect(
			getFileDiffSaveContent({
				editorValue: undefined,
				editedContent: null,
				modifiedContent: "original value",
			}),
		).toBe("original value");
	});
});
