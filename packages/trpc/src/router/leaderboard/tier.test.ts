import { describe, expect, test } from "bun:test";
import {
	computeTier,
	costTier,
	depthTier,
	type FactoryDayRow,
	outputTier,
	sustainTier,
	tierName,
	tierProgress,
	widthTier,
} from "./tier";

function days(
	count: number,
	over: Partial<FactoryDayRow> = {},
	from = "2026-08-01",
): FactoryDayRow[] {
	const start = Date.parse(`${from}T00:00:00Z`);
	return Array.from({ length: count }, (_, i) => ({
		day: new Date(start + i * 86_400_000).toISOString().slice(0, 10),
		tokens: 120_000_000,
		sessions: 8,
		parallelSessions: 3,
		agentPrsMerged: 1,
		agentPrsAllHosts: 1,
		usd: 7,
		...over,
	}));
}

describe("axis floors", () => {
	test("width quotes the essay's 3 and 10", () => {
		expect(widthTier(2)).toBe(2);
		expect(widthTier(3)).toBe(3);
		expect(widthTier(9)).toBe(3);
		expect(widthTier(10)).toBe(4);
	});

	test("width 0 is unranked, not tier 1", () => {
		expect(widthTier(0)).toBe(0);
	});

	test("depth grades tokens per session", () => {
		expect(depthTier(100_000)).toBe(1);
		expect(depthTier(2_500_000)).toBe(2);
		expect(depthTier(40_000_000)).toBe(4);
	});

	test("output grades weekly merged agent PRs", () => {
		expect(outputTier(0)).toBe(1);
		expect(outputTier(3)).toBe(3);
		expect(outputTier(10)).toBe(4);
	});

	test("sustain needs 8 active days to rank at all", () => {
		expect(sustainTier(7)).toBe(0);
		expect(sustainTier(8)).toBe(1);
		expect(sustainTier(20)).toBe(4);
	});
});

describe("computeTier", () => {
	test("fewer than 8 active days is unranked", () => {
		expect(computeTier(days(7)).tier).toBe(0);
	});

	test("takes the MIN across axes, not the average", () => {
		const result = computeTier(
			days(20, {
				parallelSessions: 14,
				tokens: 200_000_000,
				sessions: 10,
				agentPrsMerged: 0,
				agentPrsAllHosts: 0,
			}),
		);
		expect(result.tier).toBe(1);
		expect(result.limitedBy).toContain("output");
	});

	test("all axes strong reaches Henry Ford", () => {
		const result = computeTier(
			days(22, {
				parallelSessions: 12,
				tokens: 400_000_000,
				sessions: 10,
				agentPrsMerged: 2,
				agentPrsAllHosts: 2,
			}),
		);
		expect(result.tier).toBe(4);
		expect(tierName(result.tier)).toBe("Henry Ford");
	});

	test("activeDays caps the tier however good the days are", () => {
		const strong = {
			parallelSessions: 12,
			tokens: 400_000_000,
			sessions: 10,
			agentPrsMerged: 2,
			agentPrsAllHosts: 2,
		};
		expect(computeTier(days(22, strong)).tier).toBe(4);
		expect(computeTier(days(9, strong)).tier).toBe(1);
	});

	test("output reads a trailing 7-day rate, not a single day", () => {
		const rows = days(20, { agentPrsMerged: 0, agentPrsAllHosts: 0, usd: 3 });
		for (let i = 0; i < rows.length; i += 7) {
			const row = rows[i];
			if (row) row.agentPrsMerged = 3;
		}
		expect(computeTier(rows).tier).toBe(3);
	});

	test("holds the previous tier through a dip rather than flapping", () => {
		const mixed = [
			...days(11, { parallelSessions: 3 }),
			...days(9, { parallelSessions: 1 }, "2026-08-12"),
		];
		expect(computeTier(mixed, 3).tier).toBe(3);
		expect(computeTier(mixed, 0).tier).toBe(1);
	});

	test("demotes once the current tier drops under 40% of active days", () => {
		const collapsed = [
			...days(3, { parallelSessions: 3 }),
			...days(17, { parallelSessions: 1 }, "2026-08-04"),
		];
		expect(computeTier(collapsed, 3).tier).toBe(1);
	});

	test("tokens alone cannot buy a tier", () => {
		const result = computeTier(
			days(20, {
				parallelSessions: 1,
				tokens: 900_000_000,
				sessions: 1,
				agentPrsMerged: 20,
				agentPrsAllHosts: 20,
			}),
		);
		expect(result.tier).toBe(1);
		expect(result.limitedBy).toContain("width");
	});
});

describe("costTier", () => {
	test("cheaper per merged PR earns a higher tier", () => {
		expect(costTier(15)).toBe(1);
		expect(costTier(9)).toBe(2);
		expect(costTier(7)).toBe(3);
		expect(costTier(3.5)).toBe(4);
		expect(costTier(20)).toBe(0);
	});

	test("no merges leaves the axis unranked rather than free", () => {
		expect(costTier(0)).toBe(0);
		expect(costTier(Number.POSITIVE_INFINITY)).toBe(0);
	});

	test("an expensive first PR caps the tier but never unranks", () => {
		const rows = days(10, { agentPrsMerged: 0, agentPrsAllHosts: 0, usd: 5 });
		const first = rows[0];
		if (first) {
			first.agentPrsMerged = 1;
			first.agentPrsAllHosts = 1;
			first.usd = 50;
		}
		expect(
			computeTier(days(10, { agentPrsMerged: 0, agentPrsAllHosts: 0 })).tier,
		).toBe(1);
		expect(computeTier(rows).tier).toBe(1);
		expect(computeTier(rows, 2).tier).toBe(1);
	});
});

describe("tierProgress", () => {
	const full = { width: 10, depth: 40e6, output: 10, sustain: 20, cost: 3.5 };

	test("unranked has no progress", () => {
		expect(tierProgress(full, 0)).toBe(0);
	});

	test("the top tier is complete", () => {
		expect(tierProgress(full, 4)).toBe(1);
	});

	test("halfway on every axis reads as halfway", () => {
		expect(
			tierProgress(
				{ width: 1.5, depth: 1_250_000, output: 0.5, sustain: 9, cost: 12 },
				1,
			),
		).toBe(0.5);
	});

	test("one dead axis no longer zeroes the whole bar", () => {
		expect(
			tierProgress(
				{ width: 2, depth: 2_500_000, output: 1, sustain: 8, cost: 9 },
				1,
			),
		).toBe(0.8);
	});

	test("overshooting an axis does not push past the next station", () => {
		expect(
			tierProgress(
				{ width: 99, depth: 9e9, output: 99, sustain: 30, cost: 0.01 },
				1,
			),
		).toBe(1);
	});
});
