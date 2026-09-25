import { describe, expect, test } from "bun:test";
import { CATALOG } from "./achievements";
import { type AwardInput, evaluateAwards, longestStreak } from "./awards";

const NOTHING: AwardInput = {
	lifetimeAgentPrs: 0,
	daysAtWidth2: 0,
	daysAtWidth3: 0,
	axisDepth: 0,
	longestStreak: 0,
	axisCost: 0,
	clearedRun01: 0,
	isDayOne: 0,
	tokens: 0,
	usd: 0,
	sessions: 0,
	on: "2026-09-03",
};

const held = (input: Partial<AwardInput>) =>
	evaluateAwards({ ...NOTHING, ...input }).map((a) => `${a.slug}:${a.tier}`);

describe("evaluateAwards", () => {
	test("awards nothing for an empty profile", () => {
		expect(evaluateAwards(NOTHING)).toEqual([]);
	});

	test("emits one row per level so each crossing is its own award", () => {
		expect(held({ lifetimeAgentPrs: 100 })).toEqual([
			"ship-it:1",
			"ship-it:2",
			"ship-it:3",
		]);
	});

	test("a single merged PR earns the first level only", () => {
		expect(held({ lifetimeAgentPrs: 1 })).toEqual(["ship-it:1"]);
	});

	test("width families are independent of each other", () => {
		expect(held({ daysAtWidth2: 30, daysAtWidth3: 10 })).toEqual([
			"two-hands:1",
			"two-hands:2",
			"plant-floor:1",
		]);
	});

	test("cost awards on being under the ceiling", () => {
		expect(held({ axisCost: 280 })).toEqual(["efficient:1", "efficient:2"]);
	});

	test("a zero cost earns nothing rather than every level", () => {
		expect(held({ axisCost: 0 })).toEqual([]);
	});

	test("single-award families carry tier 0", () => {
		expect(held({ clearedRun01: 1, isDayOne: 1 })).toEqual([
			"run-01:0",
			"day-one:0",
		]);
	});

	test("milestones award from the same pass as badges", () => {
		expect(held({ tokens: 100_000_000, sessions: 600 })).toEqual([
			"tokens:1",
			"tokens:2",
			"sessions:1",
			"sessions:2",
		]);
	});

	test("badges and milestones can be earned together", () => {
		expect(held({ lifetimeAgentPrs: 1, usd: 1_000 })).toEqual([
			"ship-it:1",
			"spend:1",
			"spend:2",
		]);
	});

	test("carries the earning value through for display", () => {
		const [award] = evaluateAwards({ ...NOTHING, lifetimeAgentPrs: 12 });
		expect(award?.value).toBe(12);
	});

	test("respects retirement", () => {
		const input = { ...NOTHING, lifetimeAgentPrs: 5 };
		const shipIt = CATALOG.find((def) => def.slug === "ship-it");
		if (!shipIt) throw new Error("ship-it missing from the catalog");
		const catalog = [{ ...shipIt, retiredAt: "2026-09-30" }];

		expect(
			evaluateAwards({ ...input, on: "2026-09-29" }, catalog).some(
				(a) => a.slug === "ship-it",
			),
		).toBe(true);
		expect(evaluateAwards({ ...input, on: "2026-10-01" }, catalog)).toEqual([]);
	});
});

describe("catalog wiring", () => {
	test("every measure is satisfied by AwardInput", () => {
		for (const def of CATALOG) {
			expect(NOTHING[def.measure]).toBe(0);
		}
	});

	test("adding a threshold needs no evaluator change", () => {
		const everything: AwardInput = {
			...NOTHING,
			lifetimeAgentPrs: 10_000,
			daysAtWidth2: 500,
			daysAtWidth3: 500,
			axisDepth: 50_000_000,
			longestStreak: 400,
			axisCost: 1,
			clearedRun01: 1,
			isDayOne: 1,
			tokens: 20_000_000_000,
			usd: 20_000,
			sessions: 10_000,
		};

		const expected = CATALOG.reduce(
			(sum, def) => sum + Math.max(1, def.thresholds.length),
			0,
		);
		expect(evaluateAwards(everything)).toHaveLength(expected);
	});
});

describe("longestStreak", () => {
	test("is zero with no days", () => {
		expect(longestStreak([])).toBe(0);
	});

	test("is one for a single day", () => {
		expect(longestStreak(["2026-09-01"])).toBe(1);
	});

	test("counts consecutive days", () => {
		expect(longestStreak(["2026-09-01", "2026-09-02", "2026-09-03"])).toBe(3);
	});

	test("breaks on a gap and keeps the longest run", () => {
		expect(
			longestStreak([
				"2026-09-01",
				"2026-09-02",
				"2026-09-03",
				"2026-09-05",
				"2026-09-06",
			]),
		).toBe(3);
	});

	test("is order independent and deduplicates", () => {
		expect(
			longestStreak(["2026-09-03", "2026-09-01", "2026-09-02", "2026-09-02"]),
		).toBe(3);
	});

	test("crosses a month boundary", () => {
		expect(longestStreak(["2026-08-31", "2026-09-01"])).toBe(2);
	});

	test("crosses a leap day", () => {
		expect(longestStreak(["2028-02-28", "2028-02-29", "2028-03-01"])).toBe(3);
	});
});
