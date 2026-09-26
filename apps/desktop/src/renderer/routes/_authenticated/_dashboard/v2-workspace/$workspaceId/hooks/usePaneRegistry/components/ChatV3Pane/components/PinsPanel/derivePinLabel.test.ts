import { describe, expect, test } from "bun:test";

import { derivePinLabel } from "./derivePinLabel";

describe("derivePinLabel", () => {
	test("uses the first heading without the marker", () => {
		expect(derivePinLabel("# Deploy checklist\n- [ ] build")).toBe(
			"Deploy checklist",
		);
	});

	test("strips quote, list, and ordered-list markers", () => {
		expect(derivePinLabel("> quoted line")).toBe("quoted line");
		expect(derivePinLabel("- [ ] build the thing")).toBe("build the thing");
		expect(derivePinLabel("1. First step")).toBe("First step");
	});

	test("skips blank lines", () => {
		expect(derivePinLabel("\n\n  \nHello")).toBe("Hello");
	});

	test("returns an empty label for empty text", () => {
		expect(derivePinLabel("")).toBe("");
		expect(derivePinLabel("   \n  ")).toBe("");
	});

	test("truncates long labels with an ellipsis", () => {
		const label = derivePinLabel(`${"x".repeat(200)}`);
		expect(label.length).toBeLessThanOrEqual(60);
		expect(label.endsWith("…")).toBe(true);
	});
});
