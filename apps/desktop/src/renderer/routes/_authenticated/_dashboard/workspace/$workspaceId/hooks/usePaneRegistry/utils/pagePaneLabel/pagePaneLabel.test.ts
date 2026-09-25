import { describe, expect, test } from "bun:test";
import { pagePaneLabel } from "./pagePaneLabel";

describe("pagePaneLabel", () => {
	test("prefers the title", () => {
		expect(pagePaneLabel({ slug: "q3-report", title: "Q3 Report" })).toBe(
			"Q3 Report",
		);
	});

	test("falls back to the slug when the title is absent", () => {
		expect(pagePaneLabel({ slug: "q3-report" })).toBe("q3-report");
	});

	test("treats a blank title as absent rather than rendering nothing", () => {
		expect(pagePaneLabel({ slug: "q3-report", title: "   " })).toBe(
			"q3-report",
		);
	});

	test("names an untitled page when there is nothing else to show", () => {
		expect(pagePaneLabel({ slug: "", title: "" })).toBe("Untitled Page");
	});
});
