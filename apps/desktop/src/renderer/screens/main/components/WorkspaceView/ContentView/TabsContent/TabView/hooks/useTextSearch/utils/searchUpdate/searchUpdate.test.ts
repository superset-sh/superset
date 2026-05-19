import { describe, expect, test } from "bun:test";
import { computeSearchUpdate } from "./searchUpdate";

describe("computeSearchUpdate", () => {
	test("user-initiated search starts at first match and scrolls", () => {
		const result = computeSearchUpdate({
			rangeCount: 5,
			currentActiveIndex: 0,
			preserveActiveMatch: false,
		});

		expect(result.matchCount).toBe(5);
		expect(result.activeMatchIndex).toBe(0);
		expect(result.shouldScrollActiveIntoView).toBe(true);
	});

	test("user-initiated search resets index to 0 even when current index is non-zero", () => {
		const result = computeSearchUpdate({
			rangeCount: 5,
			currentActiveIndex: 3,
			preserveActiveMatch: false,
		});

		expect(result.activeMatchIndex).toBe(0);
		expect(result.shouldScrollActiveIntoView).toBe(true);
	});

	test("re-search after DOM mutation preserves active match index (Issue #3979)", () => {
		// Repro: user opened cmd+f, pressed Enter to advance to match index 1.
		// Diff library mutates the DOM (e.g., lazy syntax highlighting), which
		// triggers our MutationObserver and re-runs the search. Without the
		// preserveActiveMatch flag, the active match snapped back to 0 and the
		// view scrolled to the first match — making findNext unusable.
		const result = computeSearchUpdate({
			rangeCount: 5,
			currentActiveIndex: 1,
			preserveActiveMatch: true,
		});

		expect(result.activeMatchIndex).toBe(1);
		expect(result.shouldScrollActiveIntoView).toBe(false);
	});

	test("re-search clamps active index when matches shrink", () => {
		const result = computeSearchUpdate({
			rangeCount: 2,
			currentActiveIndex: 4,
			preserveActiveMatch: true,
		});

		expect(result.activeMatchIndex).toBe(1);
		expect(result.shouldScrollActiveIntoView).toBe(false);
	});

	test("re-search keeps preserved index when matches grow", () => {
		const result = computeSearchUpdate({
			rangeCount: 10,
			currentActiveIndex: 3,
			preserveActiveMatch: true,
		});

		expect(result.activeMatchIndex).toBe(3);
		expect(result.shouldScrollActiveIntoView).toBe(false);
	});

	test("zero matches resets index regardless of preserve flag", () => {
		const preserved = computeSearchUpdate({
			rangeCount: 0,
			currentActiveIndex: 4,
			preserveActiveMatch: true,
		});
		const fresh = computeSearchUpdate({
			rangeCount: 0,
			currentActiveIndex: 4,
			preserveActiveMatch: false,
		});

		expect(preserved.matchCount).toBe(0);
		expect(preserved.activeMatchIndex).toBe(0);
		expect(preserved.shouldScrollActiveIntoView).toBe(false);
		expect(fresh.matchCount).toBe(0);
		expect(fresh.activeMatchIndex).toBe(0);
		expect(fresh.shouldScrollActiveIntoView).toBe(false);
	});

	test("negative current index is clamped to 0 when preserving", () => {
		const result = computeSearchUpdate({
			rangeCount: 5,
			currentActiveIndex: -1,
			preserveActiveMatch: true,
		});

		expect(result.activeMatchIndex).toBe(0);
	});
});
