import { describe, expect, it } from "bun:test";
import {
	boundSelectionSnippet,
	SELECTION_MAX_CHARS,
	SELECTION_MAX_LINES,
} from "./boundSelectionSnippet";

function makeLines(count: number): string {
	return Array.from({ length: count }, (_, i) => `line${i + 1}`).join("\n");
}

describe("boundSelectionSnippet (Contract 3 / edge case #2)", () => {
	it("returns a small snippet verbatim with truncated:false", () => {
		const raw = "const x = 1;\nconst y = 2;";

		const result = boundSelectionSnippet(raw);

		expect(result).toEqual({ text: raw, truncated: false });
	});

	it("caps a selection exceeding SELECTION_MAX_LINES and keeps the head", () => {
		const raw = makeLines(SELECTION_MAX_LINES + 50);

		const result = boundSelectionSnippet(raw);

		expect(result.truncated).toBe(true);
		// head-keep: the first kept line survives, the last source line does not.
		expect(result.text.startsWith("line1\n")).toBe(true);
		expect(result.text).not.toContain(`line${SELECTION_MAX_LINES + 50}`);
		const keptLines = result.text
			.split("\n")
			.filter((l) => /^line\d+$/.test(l)).length;
		expect(keptLines).toBeLessThanOrEqual(SELECTION_MAX_LINES);
	});

	it("appends an explicit truncation marker when it truncates", () => {
		const raw = makeLines(SELECTION_MAX_LINES + 10);

		const result = boundSelectionSnippet(raw);

		expect(result.truncated).toBe(true);
		expect(result.text.toLowerCase()).toContain("truncated");
	});

	it("hard-cuts at SELECTION_MAX_CHARS for a single very long line under the line cap", () => {
		const raw = "x".repeat(SELECTION_MAX_CHARS + 5_000);

		const result = boundSelectionSnippet(raw);

		expect(result.truncated).toBe(true);
		// The kept body (excluding the marker) never exceeds the char budget.
		const xs = result.text.replace(/[^x]/g, "").length;
		expect(xs).toBeLessThanOrEqual(SELECTION_MAX_CHARS);
	});

	it("never emits a marker for content exactly at the line cap", () => {
		const raw = makeLines(SELECTION_MAX_LINES);

		const result = boundSelectionSnippet(raw);

		expect(result.truncated).toBe(false);
		expect(result.text).toBe(raw);
	});
});
