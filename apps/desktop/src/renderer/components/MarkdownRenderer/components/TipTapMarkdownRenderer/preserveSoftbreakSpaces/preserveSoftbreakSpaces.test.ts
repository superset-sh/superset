import { describe, expect, it } from "bun:test";
import { softbreakNewlineToSpace } from "./preserveSoftbreakSpaces";

describe("softbreakNewlineToSpace", () => {
	it("turns a softbreak before a word into a space (Mem0 README case)", () => {
		expect(softbreakNewlineToSpace("\nassistants. It provides")).toBe(
			" assistants. It provides",
		);
	});

	it("leaves already-spaced text alone", () => {
		expect(softbreakNewlineToSpace(" assistants")).toBe(" assistants");
	});

	it("leaves a lone newline alone (block separator whitespace)", () => {
		expect(softbreakNewlineToSpace("\n")).toBe("\n");
	});

	it("leaves a newline before more whitespace alone", () => {
		expect(softbreakNewlineToSpace("\n\n")).toBe("\n\n");
		expect(softbreakNewlineToSpace("\n ")).toBe("\n ");
	});

	it("does not touch text without a leading newline", () => {
		expect(softbreakNewlineToSpace("assistants")).toBe("assistants");
	});

	it("survives tiptap-markdown normalizeDOM strip after conversion", () => {
		const afterUpdateDom = softbreakNewlineToSpace("\nassistants.");
		// Same strip tiptap-markdown applies after updateDOM hooks.
		const afterNormalize = afterUpdateDom.replace(/^\n/, "");
		expect(afterNormalize).toBe(" assistants.");
	});
});
