import { describe, expect, it } from "bun:test";
import { extractReasoningHeading } from "./reasoningHeading";

describe("extractReasoningHeading", () => {
	it("returns empty for empty input", () => {
		expect(extractReasoningHeading("")).toBe("");
		expect(extractReasoningHeading("\n\n\t  ")).toBe("");
	});

	it("prefers a markdown heading when present", () => {
		expect(extractReasoningHeading("# Plan\n\nDetails go here.")).toBe("Plan");
		expect(
			extractReasoningHeading("## Step 2: evaluate options\n\nmore"),
		).toBe("Step 2: evaluate options");
	});

	it("strips trailing hashes on ATX headings", () => {
		expect(extractReasoningHeading("## foo ##")).toBe("foo");
	});

	it("extracts a bold lead like **Plan:** …", () => {
		expect(
			extractReasoningHeading("**Plan:** consider options before running"),
		).toBe("Plan");
	});

	it("extracts a bold-only line as a heading", () => {
		expect(extractReasoningHeading("**Consider approach**\n\nThen…")).toBe(
			"Consider approach",
		);
	});

	it("falls back to the first non-empty line truncated", () => {
		expect(
			extractReasoningHeading(
				"\n\nI need to think about the edge cases here.\n\nmore.",
			),
		).toBe("I need to think about the edge cases here.");
	});

	it("truncates long headings to 80 chars with ellipsis", () => {
		const long = "a".repeat(200);
		const h = extractReasoningHeading(long);
		expect(h.length).toBeLessThanOrEqual(80);
		expect(h.endsWith("…")).toBe(true);
	});
});
