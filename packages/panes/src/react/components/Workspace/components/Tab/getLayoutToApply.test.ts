import { describe, expect, test } from "bun:test";
import { getLayoutToApply } from "./getLayoutToApply";

describe("getLayoutToApply", () => {
	test("returns the target layout when the group has no layout yet", () => {
		expect(getLayoutToApply(undefined, 33.33)).toEqual([33.33, 66.67]);
		expect(getLayoutToApply([], 40)).toEqual([40, 60]);
	});

	test("returns null when the live layout already matches the store", () => {
		// Already in sync → no-op so we don't clobber an in-progress drag or
		// loop with the group's onLayout callback.
		expect(getLayoutToApply([50, 50], 50)).toBeNull();
		expect(getLayoutToApply([33.3, 66.7], 33.33)).toBeNull();
	});

	test(
		"applies the store split when it diverges from the live layout " +
			"(reproduces #5094: Equalize Pane Splits)",
		() => {
			// User dragged the split to 80/20, then triggered Equalize, which set
			// the store's splitPercentage to 50. Before the fix the panels stayed
			// at 80/20 because `defaultSize` is mount-only; the sync must push the
			// new 50/50 layout into the PanelGroup.
			expect(getLayoutToApply([80, 20], 50)).toEqual([50, 50]);

			// Equalizing a 3-pane tab balances the outer split to 33.33/66.67.
			expect(getLayoutToApply([70, 30], 33.33)).toEqual([33.33, 66.67]);
		},
	);

	test("treats sub-epsilon differences as in sync", () => {
		expect(getLayoutToApply([50.3, 49.7], 50)).toBeNull();
		expect(getLayoutToApply([50.6, 49.4], 50)).toEqual([50, 50]);
	});
});
