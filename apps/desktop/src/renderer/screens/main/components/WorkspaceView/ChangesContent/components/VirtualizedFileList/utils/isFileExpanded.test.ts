import { describe, expect, test } from "bun:test";
import { isFileExpanded } from "./isFileExpanded";

describe("isFileExpanded", () => {
	const fileKey = "staged::src/foo.ts";

	test("returns true when file is in neither collapsedFiles nor viewedFiles", () => {
		const collapsed = new Set<string>();
		const viewed = new Set<string>();
		expect(isFileExpanded(fileKey, collapsed, viewed)).toBe(true);
	});

	test("returns false when file is in collapsedFiles", () => {
		const collapsed = new Set<string>([fileKey]);
		const viewed = new Set<string>();
		expect(isFileExpanded(fileKey, collapsed, viewed)).toBe(false);
	});

	test("returns false when file is in viewedFiles", () => {
		const collapsed = new Set<string>();
		const viewed = new Set<string>([fileKey]);
		expect(isFileExpanded(fileKey, collapsed, viewed)).toBe(false);
	});

	test("returns false when file is in both collapsedFiles and viewedFiles", () => {
		const collapsed = new Set<string>([fileKey]);
		const viewed = new Set<string>([fileKey]);
		expect(isFileExpanded(fileKey, collapsed, viewed)).toBe(false);
	});

	/**
	 * Reproduces #2687: after switching workspaces, InfiniteScrollView remounts
	 * and resets collapsedFiles to an empty Set. Previously, isExpanded was
	 * derived only from collapsedFiles, so viewed files would appear expanded
	 * again. With the fix, viewedFiles (persisted in ScrollContext) keeps them
	 * collapsed.
	 */
	test("viewed files stay collapsed after collapsedFiles resets (workspace switch)", () => {
		// Before workspace switch: file is in both sets
		const collapsedBefore = new Set<string>([fileKey]);
		const viewed = new Set<string>([fileKey]);
		expect(isFileExpanded(fileKey, collapsedBefore, viewed)).toBe(false);

		// After workspace switch: collapsedFiles resets, but viewedFiles persists
		const collapsedAfter = new Set<string>();
		expect(isFileExpanded(fileKey, collapsedAfter, viewed)).toBe(false);
	});
});
