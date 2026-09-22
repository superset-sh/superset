import { describe, expect, test } from "bun:test";
import {
	BANDS,
	computeTier,
	costTier,
	depthTier,
	type FactoryDayRow,
	factoryScore,
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

	test("a strong axis carries a weak one instead of being zeroed by it", () => {
		const result = computeTier(
			days(20, {
				parallelSessions: 14,
				tokens: 200_000_000,
				sessions: 10,
				agentPrsMerged: 0,
				agentPrsAllHosts: 0,
			}),
		);
		expect(result.tier).toBeGreaterThan(1);
		expect(result.score).toBeGreaterThan(0);
	});

	test("an axis with no signal is dropped, not scored zero", () => {
		const noPrs = days(20, {
			parallelSessions: 4,
			tokens: 100_000_000,
			sessions: 10,
			agentPrsMerged: 0,
			agentPrsAllHosts: 0,
		});
		expect(computeTier(noPrs).limitedBy).not.toContain("output");
		expect(computeTier(noPrs).limitedBy).not.toContain("cost");
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

	test("holds a tier through a small dip, then lets it go", () => {
		const holds = computeTier(days(20, { parallelSessions: 5 }), 3);
		expect(holds.score).toBeGreaterThanOrEqual((BANDS[1] ?? 0) - 3);
		expect(holds.score).toBeLessThan(BANDS[1] ?? 0);
		expect(holds.tier).toBe(3);

		const drops = computeTier(days(20, { parallelSessions: 4 }), 3);
		expect(drops.score).toBeLessThan((BANDS[1] ?? 0) - 3);
		expect(drops.tier).toBe(2);
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
		const spiky = days(20, { agentPrsMerged: 0, agentPrsAllHosts: 0, usd: 3 });
		for (let i = 0; i < spiky.length; i += 7) {
			const row = spiky[i];
			if (row) row.agentPrsMerged = 3;
		}
		const flat = days(20, { agentPrsMerged: 0, agentPrsAllHosts: 0, usd: 3 });

		expect(computeTier(spiky).axisOutput).toBeGreaterThan(
			computeTier(flat).axisOutput,
		);
	});

	test("holds the previous tier through a shallow dip rather than flapping", () => {
		const strong = days(20, {
			parallelSessions: 8,
			tokens: 300_000_000,
			sessions: 10,
			agentPrsMerged: 2,
			agentPrsAllHosts: 2,
		});
		const held = computeTier(strong);

		const dipped = days(20, {
			parallelSessions: 7.4,
			tokens: 300_000_000,
			sessions: 10,
			agentPrsMerged: 2,
			agentPrsAllHosts: 2,
		});
		expect(computeTier(dipped, held.tier).tier).toBe(held.tier);
	});

	test("demotes once the score falls well clear of the band", () => {
		const collapsed = days(20, {
			parallelSessions: 1,
			tokens: 2_000_000,
			sessions: 10,
			agentPrsMerged: 0,
			agentPrsAllHosts: 0,
		});
		expect(computeTier(collapsed, 3).tier).toBeLessThan(3);
	});

	test("one axis alone cannot buy the top tier", () => {
		const result = computeTier(
			days(20, {
				parallelSessions: 1,
				tokens: 900_000_000,
				sessions: 1,
				agentPrsMerged: 20,
				agentPrsAllHosts: 20,
			}),
		);
		expect(result.tier).toBeLessThan(4);
		expect(result.limitedBy).toContain("width");
	});
});

describe("costTier", () => {
	test("cheaper per merged PR earns a higher tier", () => {
		expect(costTier(2000)).toBe(1);
		expect(costTier(750)).toBe(2);
		expect(costTier(300)).toBe(3);
		expect(costTier(100)).toBe(4);
		expect(costTier(2500)).toBe(0);
	});

	test("no merges leaves the axis unranked rather than free", () => {
		expect(costTier(0)).toBe(0);
		expect(costTier(Number.POSITIVE_INFINITY)).toBe(0);
	});

	test("an expensive first PR caps the tier but never unranks", () => {
		const strong = {
			parallelSessions: 8,
			tokens: 300_000_000,
			sessions: 10,
			agentPrsMerged: 2,
			agentPrsAllHosts: 2,
		};
		const rows = days(20, { ...strong, usd: 5 });
		const first = rows[0];
		if (first) {
			first.usd = 100_000;
		}

		expect(computeTier(days(20, { ...strong, usd: 5 })).tier).toBeGreaterThan(
			1,
		);
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

	test("progress is the position inside the current band", () => {
		const mid = { width: 3, depth: 9e6, output: 2, sustain: 20, cost: 300 };
		const { score } = factoryScore(mid);
		const band = BANDS[0] ?? 0;

		expect(tierProgress(mid, 1)).toBeCloseTo(
			Math.min(1, Math.max(0, score / band)),
			3,
		);
	});

	test("a stronger profile always reads as further along", () => {
		const weak = {
			width: 1.5,
			depth: 3e6,
			output: 0.5,
			sustain: 10,
			cost: 900,
		};
		const strong = { width: 4, depth: 2e7, output: 3, sustain: 26, cost: 200 };
		expect(tierProgress(strong, 1)).toBeGreaterThan(tierProgress(weak, 1));
	});

	test("one dead axis no longer zeroes the whole bar", () => {
		const deadWidth = {
			width: 1,
			depth: 3e7,
			output: 4,
			sustain: 28,
			cost: 150,
		};
		expect(tierProgress(deadWidth, 1)).toBeGreaterThan(0.5);
	});

	test("overshooting an axis does not push past the next band", () => {
		expect(
			tierProgress(
				{ width: 99, depth: 9e9, output: 99, sustain: 30, cost: 0.01 },
				1,
			),
		).toBe(1);
	});
});
