import { describe, expect, test } from "bun:test";
import {
	APP_OPTIONS,
	FINDER_OPTIONS,
	filterAvailableAppOptions,
	IDE_OPTIONS,
} from "./constants";

describe("filterAvailableAppOptions", () => {
	test("keeps only detected apps and always keeps Finder", () => {
		expect(
			filterAvailableAppOptions(
				[...FINDER_OPTIONS, ...IDE_OPTIONS],
				["cursor"],
			).map(({ id }) => id),
		).toEqual(["finder", "cursor"]);
	});

	test("preserves the existing list while loading or after failure", () => {
		expect(filterAvailableAppOptions(APP_OPTIONS, undefined)).toBe(APP_OPTIONS);
		expect(filterAvailableAppOptions(APP_OPTIONS, null)).toBe(APP_OPTIONS);
	});
});
