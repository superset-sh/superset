import { describe, expect, test } from "bun:test";
import { elementsForChips, splitByElements } from "./messageElements";

describe("messageElements", () => {
	test("round-trips chips through byte ranges, past non-ASCII text", () => {
		const text = "café: look at src/a.ts and src/a.ts again";
		const chip = {
			label: "a.ts",
			serialized: "src/a.ts",
			data: { elementKind: "file_mention" },
		};
		const elements = elementsForChips(text, [chip, chip]);
		expect(elements.map((element) => element.byteRange)).toEqual([
			{ start: 15, end: 23 },
			{ start: 28, end: 36 },
		]);
		expect(
			splitByElements(text, elements).map((segment) =>
				segment.element ? `[${segment.element.label}]` : segment.text,
			),
		).toEqual(["café: look at ", "[a.ts]", " and ", "[a.ts]", " again"]);
	});
});
