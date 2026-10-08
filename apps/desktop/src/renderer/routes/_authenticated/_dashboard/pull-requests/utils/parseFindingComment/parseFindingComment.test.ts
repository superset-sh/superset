import { describe, expect, it } from "bun:test";
import { parseFindingComment } from "./parseFindingComment";

describe("parseFindingComment", () => {
	it("lifts a bot finding's title and severity out of the body", () => {
		expect(
			parseFindingComment(
				"## Unbounded retry loop\n\n**High Severity**\n\nThe loop never exits when…",
			),
		).toEqual({
			title: "Unbounded retry loop",
			severity: "High",
			body: "The loop never exits when…",
		});
	});

	it("leaves ordinary comments alone, even ones that start with a heading", () => {
		expect(parseFindingComment("## Summary\n\nLooks good to me.")).toBeNull();
		expect(parseFindingComment("Plain comment")).toBeNull();
	});
});
