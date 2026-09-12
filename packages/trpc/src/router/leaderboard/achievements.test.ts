import { describe, expect, test } from "bun:test";
import {
	ACHIEVEMENT_GRID,
	BADGES,
	CATALOG,
	CATALOG_BY_SLUG,
	earnedTier,
	highestPerSlug,
	isRetired,
	MILESTONES,
	totalAwardableRows,
} from "./achievements";

describe("catalog shape", () => {
	test("every slug is unique and indexed", () => {
		const slugs = CATALOG.map((entry) => entry.slug);
		expect(new Set(slugs).size).toBe(slugs.length);
		for (const slug of slugs) {
			expect(CATALOG_BY_SLUG[slug]?.slug).toBe(slug);
		}
	});

	test("badges and milestones partition the catalog", () => {
		expect(BADGES.length + MILESTONES.length).toBe(CATALOG.length);
	});

	test("thresholds ascend, or descend when lower is better", () => {
		for (const def of CATALOG) {
			const sorted = [...def.thresholds].sort((a, b) =>
				def.lowerIsBetter ? b - a : a - b,
			);
			expect(def.thresholds).toEqual(sorted);
		}
	});

	test("no family exceeds four levels", () => {
		for (const def of CATALOG) {
			expect(def.thresholds.length).toBeLessThanOrEqual(4);
		}
	});
});

describe("badge art", () => {
	test.each(
		BADGES.map((b) => [b.slug, b] as const),
	)("%s is a square of only # and .", (_slug, def) => {
		expect(def.art).not.toBeNull();
		expect(def.art).toHaveLength(ACHIEVEMENT_GRID);
		for (const row of def.art ?? []) {
			expect(row).toHaveLength(ACHIEVEMENT_GRID);
			expect(row).toMatch(/^[#.]+$/);
		}
	});

	test("art is distinct per badge", () => {
		const rendered = BADGES.map((b) => (b.art ?? []).join("\n"));
		expect(new Set(rendered).size).toBe(rendered.length);
	});

	test("milestones carry no art so they render as chips", () => {
		for (const def of MILESTONES) {
			expect(def.art).toBeNull();
		}
	});
});

describe("earnedTier", () => {
	const shipIt = CATALOG_BY_SLUG["ship-it"];
	const efficient = CATALOG_BY_SLUG.efficient;

	test("awards nothing below the first threshold", () => {
		expect(earnedTier(shipIt, 0)).toBe(0);
	});

	test("awards the highest threshold met", () => {
		expect(earnedTier(shipIt, 1)).toBe(1);
		expect(earnedTier(shipIt, 9)).toBe(1);
		expect(earnedTier(shipIt, 10)).toBe(2);
		expect(earnedTier(shipIt, 5000)).toBe(4);
	});

	test("inverts for lower-is-better", () => {
		expect(earnedTier(efficient, 1200)).toBe(0);
		expect(earnedTier(efficient, 750)).toBe(1);
		expect(earnedTier(efficient, 300)).toBe(2);
		expect(earnedTier(efficient, 100)).toBe(3);
	});

	test("treats a zero cost as unearned rather than perfect", () => {
		expect(earnedTier(efficient, 0)).toBe(0);
	});

	test("awards nothing for single-award families", () => {
		expect(earnedTier(CATALOG_BY_SLUG["run-01"], 1)).toBe(0);
	});
});

describe("totalAwardableRows", () => {
	test("counts every level of every family", () => {
		const expected = CATALOG.reduce(
			(sum, def) => sum + Math.max(1, def.thresholds.length),
			0,
		);
		expect(totalAwardableRows("2026-09-03")).toBe(expected);
	});

	test("matches what a maxed-out profile can actually hold", () => {
		const everything = CATALOG.flatMap((def) =>
			def.thresholds.length === 0
				? [`${def.slug}:0`]
				: def.thresholds.map((_, index) => `${def.slug}:${index + 1}`),
		);
		expect(everything).toHaveLength(totalAwardableRows("2026-09-03"));
	});

	test("shrinks once a family retires, so maxed profiles stay maxed", () => {
		const shipIt = CATALOG.find((def) => def.slug === "ship-it");
		if (!shipIt) throw new Error("ship-it missing from the catalog");
		const catalog = [
			...CATALOG,
			{ ...shipIt, slug: "ship-it-legacy", retiredAt: "2026-09-30" },
		];

		const before = totalAwardableRows("2026-09-29", catalog);
		const after = totalAwardableRows("2026-10-01", catalog);
		expect(before).toBe(
			totalAwardableRows("2026-09-29") + shipIt.thresholds.length,
		);
		expect(after).toBeLessThan(before);
		expect(after).toBe(totalAwardableRows("2026-10-01"));
	});
});

describe("isRetired", () => {
	test("is false while retiredAt is null", () => {
		expect(isRetired(CATALOG_BY_SLUG["day-one"], "2030-01-01")).toBe(false);
	});

	test("compares dates when set", () => {
		const retired = { ...CATALOG_BY_SLUG["day-one"], retiredAt: "2026-09-30" };
		expect(isRetired(retired, "2026-09-29")).toBe(false);
		expect(isRetired(retired, "2026-10-01")).toBe(true);
	});
});

describe("highestPerSlug", () => {
	test("keeps the date the retained tier was earned", () => {
		expect(
			highestPerSlug([
				{ slug: "ship-it", tier: 1, awardedOn: "2026-01-01" },
				{ slug: "ship-it", tier: 2, awardedOn: "2026-06-01" },
			]),
		).toEqual([{ slug: "ship-it", tier: 2, awardedOn: "2026-06-01" }]);
	});

	test("is order independent", () => {
		expect(
			highestPerSlug([
				{ slug: "ship-it", tier: 2, awardedOn: "2026-06-01" },
				{ slug: "ship-it", tier: 1, awardedOn: "2026-01-01" },
			]),
		).toEqual([{ slug: "ship-it", tier: 2, awardedOn: "2026-06-01" }]);
	});

	test("takes the earliest date when the tier is the same", () => {
		expect(
			highestPerSlug([
				{ slug: "day-one", tier: 0, awardedOn: "2026-06-01" },
				{ slug: "day-one", tier: 0, awardedOn: "2026-01-01" },
			]),
		).toEqual([{ slug: "day-one", tier: 0, awardedOn: "2026-01-01" }]);
	});
});
