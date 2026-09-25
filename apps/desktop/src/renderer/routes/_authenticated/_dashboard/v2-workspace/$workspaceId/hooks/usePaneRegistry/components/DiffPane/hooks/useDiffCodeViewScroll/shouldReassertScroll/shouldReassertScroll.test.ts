import { describe, expect, test } from "bun:test";
import { shouldReassertScroll } from "./shouldReassertScroll";

describe("shouldReassertScroll", () => {
	test("scrolls for the first request", () => {
		expect(shouldReassertScroll(null, "a:::1", 120)).toBe(true);
	});

	test("scrolls again for a new click or focus request", () => {
		expect(
			shouldReassertScroll(
				{ scrollKey: "a:::1", targetTop: 120 },
				"a:::2",
				120,
			),
		).toBe(true);
	});

	test("stays put when the target has not moved", () => {
		expect(
			shouldReassertScroll(
				{ scrollKey: "a:::1", targetTop: 120 },
				"a:::1",
				120,
			),
		).toBe(false);
	});

	test("re-scrolls when content above the target shifted it", () => {
		expect(
			shouldReassertScroll(
				{ scrollKey: "a:::1", targetTop: 120 },
				"a:::1",
				980,
			),
		).toBe(true);
	});

	test("keeps asserting while the target has no layout yet", () => {
		expect(
			shouldReassertScroll(
				{ scrollKey: "a:::1", targetTop: undefined },
				"a:::1",
				undefined,
			),
		).toBe(true);
		expect(
			shouldReassertScroll(
				{ scrollKey: "a:::1", targetTop: 120 },
				"a:::1",
				undefined,
			),
		).toBe(true);
		expect(
			shouldReassertScroll(
				{ scrollKey: "a:::1", targetTop: undefined },
				"a:::1",
				120,
			),
		).toBe(true);
	});
});
