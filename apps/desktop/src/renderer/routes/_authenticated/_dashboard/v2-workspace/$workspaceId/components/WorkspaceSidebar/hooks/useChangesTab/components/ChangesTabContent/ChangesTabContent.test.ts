import { describe, expect, test } from "bun:test";
import { shouldShowChangesLoading } from "./shouldShowChangesLoading";

describe("shouldShowChangesLoading", () => {
	test("shows loading before the first exact-workspace snapshot arrives", () => {
		expect(shouldShowChangesLoading({ data: undefined, isLoading: true })).toBe(
			true,
		);
	});

	test("keeps cached data visible during a background refresh", () => {
		expect(
			shouldShowChangesLoading({
				data: { workspaceId: "one" },
				isLoading: true,
			}),
		).toBe(false);
	});
});
