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

describe("buildSelectionPrompt (Contract 2 composition: capture -> bound -> format)", () => {
	it("anchors with 'In <path>:L<a>-L<b>' and embeds the snippet as a fenced block", () => {
		const result = buildSelectionPrompt(region(), "refactor this");

		expect(result.text).toContain("In src/a.ts:L40-L60: refactor this");
		expect(result.text).toContain("```");
		expect(result.text).toContain("const a = 1;\nconst b = 2;");
		expect(result.truncated).toBe(false);
	});

	it("uses the default instruction when none is supplied (no dangling colon)", () => {
		const result = buildSelectionPrompt(region(), undefined);

		expect(result.text).toContain(
			`In src/a.ts:L40-L60: ${DEFAULT_SELECTION_INSTRUCTION}`,
		);
		expect(result.text).not.toContain("L40-L60: \n```");
	});

	it("bounds an oversized snippet BEFORE formatting and marks it truncated", () => {
		const big = makeLines(SELECTION_MAX_LINES + 100);
		const result = buildSelectionPrompt(
			region({ text: big, startLine: 1, endLine: SELECTION_MAX_LINES + 100 }),
			"fix",
		);

		expect(result.truncated).toBe(true);
		expect(result.text.toLowerCase()).toContain("truncated");
		// The anchor still reflects the FULL selected range, not the kept extent.
		expect(result.text).toContain(
			`In src/a.ts:L1-L${SELECTION_MAX_LINES + 100}:`,
		);
		expect(result.text).not.toContain(`line${SELECTION_MAX_LINES + 100}`);
	});

	it("embeds a small snippet verbatim with no truncation marker", () => {
		const result = buildSelectionPrompt(region(), "look");

		expect(result.text.toLowerCase()).not.toContain("truncated");
		expect(result.text).toContain("const a = 1;\nconst b = 2;");
	});
});
