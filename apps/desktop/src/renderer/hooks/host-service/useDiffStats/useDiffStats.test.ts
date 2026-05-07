import { describe, expect, test } from "bun:test";
import { getDiffStatsQueryOptions } from "./useDiffStats";

describe("getDiffStatsQueryOptions", () => {
	test("enables the query for a real workspace by default", () => {
		const options = getDiffStatsQueryOptions("workspace-1");
		expect(options.enabled).toBe(true);
		expect(options.refetchOnWindowFocus).toBe(false);
	});

	test("disables the query when the workspaceId is empty", () => {
		expect(getDiffStatsQueryOptions("").enabled).toBe(false);
	});

	test("disables the query when the caller opts out via enabled: false", () => {
		// Reproduces #4198: sidebar tiles render in icon-only mode without
		// showing diff counts, but the hook had no opt-out — so every visible
		// workspace fanned out git.getStatus regardless. The hook must let
		// consumers gate by visibility.
		expect(
			getDiffStatsQueryOptions("workspace-1", { enabled: false }).enabled,
		).toBe(false);
	});

	test("treats enabled: true as the default", () => {
		expect(
			getDiffStatsQueryOptions("workspace-1", { enabled: true }).enabled,
		).toBe(true);
	});

	test("never refetches on window focus, regardless of enabled", () => {
		// Per-tile query keys mean focus refetches would re-fan the very work
		// we are trying to consolidate.
		expect(
			getDiffStatsQueryOptions("workspace-1", { enabled: true })
				.refetchOnWindowFocus,
		).toBe(false);
		expect(
			getDiffStatsQueryOptions("workspace-1", { enabled: false })
				.refetchOnWindowFocus,
		).toBe(false);
	});
});
