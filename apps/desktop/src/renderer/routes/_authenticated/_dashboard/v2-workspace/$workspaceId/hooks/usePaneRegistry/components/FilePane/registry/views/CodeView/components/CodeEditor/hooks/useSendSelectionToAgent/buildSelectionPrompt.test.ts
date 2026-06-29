import { describe, expect, it } from "bun:test";
import type { CapturedEditorSelection } from "../../CodeEditorAdapter";
import { SELECTION_MAX_LINES } from "./boundSelectionSnippet";
import {
	buildSelectionPrompt,
	DEFAULT_SELECTION_INSTRUCTION,
} from "./buildSelectionPrompt";

const region = (
	overrides?: Partial<CapturedEditorSelection>,
): CapturedEditorSelection => ({
	path: "src/a.ts",
	startLine: 40,
	endLine: 60,
	text: "const a = 1;\nconst b = 2;",
	...overrides,
});

function makeLines(count: number): string {
	return Array.from({ length: count }, (_, i) => `line${i + 1}`).join("\n");
}

describe("buildSelectionPrompt", () => {
	it("anchors with 'In <path>:L<a>-L<b>' and embeds the snippet as a fenced block", () => {
		const text = buildSelectionPrompt(region(), "refactor this");

		expect(text).toContain("In src/a.ts:L40-L60: refactor this");
		expect(text).toContain("```");
		expect(text).toContain("const a = 1;\nconst b = 2;");
		expect(text.toLowerCase()).not.toContain("truncated");
	});

	it("uses the default instruction when none is supplied (no dangling colon)", () => {
		const text = buildSelectionPrompt(region(), undefined);

		expect(text).toContain(
			`In src/a.ts:L40-L60: ${DEFAULT_SELECTION_INSTRUCTION}`,
		);
		expect(text).not.toContain("L40-L60: \n```");
	});

	it("bounds an oversized snippet BEFORE formatting and marks it truncated", () => {
		const big = makeLines(SELECTION_MAX_LINES + 100);
		const text = buildSelectionPrompt(
			region({ text: big, startLine: 1, endLine: SELECTION_MAX_LINES + 100 }),
			"fix",
		);

		expect(text.toLowerCase()).toContain("truncated");
		// The anchor still reflects the FULL selected range, not the kept extent.
		expect(text).toContain(`In src/a.ts:L1-L${SELECTION_MAX_LINES + 100}:`);
		expect(text).not.toContain(`line${SELECTION_MAX_LINES + 100}`);
	});

	it("embeds a small snippet verbatim with no truncation marker", () => {
		const text = buildSelectionPrompt(region(), "look");

		expect(text.toLowerCase()).not.toContain("truncated");
		expect(text).toContain("const a = 1;\nconst b = 2;");
	});
});
