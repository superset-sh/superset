import { describe, expect, test } from "bun:test";
import { CATALOG } from "@superset/trpc/leaderboard-achievements";
import { ACHIEVEMENT_NAMES } from "./achievementNames";

describe("achievement names", () => {
	test("every catalog entry has a display name", () => {
		const missing = CATALOG.filter((def) => !ACHIEVEMENT_NAMES[def.slug]).map(
			(def) => def.slug,
		);
		expect(missing).toEqual([]);
	});

	test("no names for slugs that are not in the catalog", () => {
		const slugs = new Set(CATALOG.map((def) => def.slug));
		const stray = Object.keys(ACHIEVEMENT_NAMES).filter(
			(slug) => !slugs.has(slug),
		);
		expect(stray).toEqual([]);
	});
});
