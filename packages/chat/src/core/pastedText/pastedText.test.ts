import { describe, expect, it } from "bun:test";
import {
	countLines,
	firstLine,
	isLargePaste,
	normalizePastedText,
	parsePastedText,
} from "./pastedText";

const lines = (count: number) =>
	Array.from({ length: count }, (_, index) => `line ${index + 1}`).join("\n");

describe("isLargePaste", () => {
	it("becomes an attachment from 5,000 chars, whatever the line count", () => {
		expect(isLargePaste(lines(200))).toBe(false);
		expect(isLargePaste("x".repeat(4999))).toBe(false);
		expect(isLargePaste("x".repeat(5000))).toBe(true);
	});

	it("leaves blank pastes and trailing newlines alone", () => {
		expect(isLargePaste("\n".repeat(30))).toBe(false);
		expect(isLargePaste(normalizePastedText(`${lines(24)}\n\n\n`))).toBe(false);
	});
});

describe("normalizePastedText", () => {
	it("uses LF and drops trailing newlines", () => {
		expect(normalizePastedText("a\r\nb\rc\n\n")).toBe("a\nb\nc");
	});
});

describe("card labels", () => {
	it("titles a paste by its first non-blank line", () => {
		expect(firstLine("\n  \n  TypeError: boom\n at x")).toBe("TypeError: boom");
		expect(countLines("a\nb\nc")).toBe(3);
	});
});

/** The trailing-block format older builds sent; parsing it still has to work. */
function legacyPastedMessage(
	prompt: string,
	pastes: readonly string[],
): string {
	const blocks = pastes.map(
		(paste) =>
			`<pasted_text lines="${paste.split("\n").length}">\n${paste}\n</pasted_text>`,
	);
	return [prompt, ...blocks].filter(Boolean).join("\n\n");
}

describe("parsePastedText", () => {
	it("round-trips the prompt and every paste", () => {
		const pastes = [lines(30), "x".repeat(4000), "  indented\n\n\ttabs"];
		const message = legacyPastedMessage("Look at these\nplease", pastes);
		expect(parsePastedText(message)).toEqual({
			text: "Look at these\nplease",
			pastes,
		});
	});

	it("keeps a paste that contains the tags itself", () => {
		const inner = legacyPastedMessage("nested", ["</pasted_text>\nmore"]);
		const paste = `before\n</pasted_text>\n${inner}`;
		expect(parsePastedText(legacyPastedMessage("typed", [paste]))).toEqual({
			text: "typed",
			pastes: [paste],
		});
	});

	it("leaves text alone when no well-formed block trails it", () => {
		const broken = 'hi\n<pasted_text lines="3">\na\n</pasted_text>';
		expect(parsePastedText(broken)).toEqual({ text: broken, pastes: [] });
		const notTrailing = `${legacyPastedMessage("hi", ["a"])}\nafter`;
		expect(parsePastedText(notTrailing)).toEqual({
			text: notTrailing,
			pastes: [],
		});
	});
});
