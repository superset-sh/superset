import { describe, expect, test } from "bun:test";
import { shouldRestoreCachedScrollState } from "./useDiffCodeViewScroll";

const cachedState = {
	scrollTop: 320,
	scrollLeft: 0,
	updatedAt: 20,
};

describe("shouldRestoreCachedScrollState", () => {
	test("restores cached state when there is no pending navigation", () => {
		expect(shouldRestoreCachedScrollState(cachedState, undefined)).toBe(true);
	});

	test("lets a newer navigation override cached state", () => {
		expect(shouldRestoreCachedScrollState(cachedState, 21)).toBe(false);
	});

	test("restores state saved after the last navigation", () => {
		expect(shouldRestoreCachedScrollState(cachedState, 19)).toBe(true);
	});
});
