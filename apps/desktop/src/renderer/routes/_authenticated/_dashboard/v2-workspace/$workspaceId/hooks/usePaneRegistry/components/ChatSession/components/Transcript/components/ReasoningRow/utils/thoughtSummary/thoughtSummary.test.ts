import { describe, expect, test } from "bun:test";
import { thoughtSummary } from "./thoughtSummary";

describe("thoughtSummary", () => {
	test("takes the first paragraph as one plain line", () => {
		expect(
			thoughtSummary(
				"\n**Checking** the `shimmer`\nprimitive first.\n\nThen the rest.",
			),
		).toBe("Checking the shimmer primitive first.");
	});

	test("is empty before any text arrives", () => {
		expect(thoughtSummary("  \n ")).toBe("");
	});

	test("skips a code block, even one with a blank line inside", () => {
		const fence = "```";
		expect(
			thoughtSummary(
				`${fence}ts\nconst a = 1;\n\nconst b = 2;\n${fence}\n\nThen check the rows.`,
			),
		).toBe("Then check the rows.");
	});

	test("shows nothing for a code block that is still open", () => {
		expect(thoughtSummary("```ts\nconst a")).toBe("");
	});
});
