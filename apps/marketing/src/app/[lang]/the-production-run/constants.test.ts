import { beforeAll, describe, expect, test } from "bun:test";
import { initI18n, initI18nAsync } from "@superset/i18n";
import {
	COST_CEILINGS,
	FLOORS,
	GRADED_AXES,
	MEASURED_TODAY,
	monthLabel,
	PRICE_DECLINE_PER_YEAR,
	PRICE_PER_MTOK_TODAY,
	PRODUCTION_TIERS,
	pricePerMtok,
	RUN_MONTHS,
	RUNS,
	runStateAt,
	runStatus,
	runStatusLabel,
	SLIDER_MONTHS,
	TRAJECTORY,
} from "./constants";

beforeAll(() => {
	initI18n("en");
});

const money = (text: string): number =>
	Number(text.replace(/[^0-9.]/g, "")) || 0;

const tokens = (text: string): number => {
	const value = Number.parseFloat(text);
	if (Number.isNaN(value)) return 0;
	if (text.includes("M")) return value * 1_000_000;
	if (text.includes("K")) return value * 1_000;
	return value;
};

const gate = (tier: number, axis: string): string =>
	PRODUCTION_TIERS[tier - 1]?.gates.find((entry) => entry.axis === axis)
		?.value ?? "";

describe("runStateAt", () => {
	test("opens on the bottom rung rather than unranked", () => {
		expect(runStateAt(0).tier).toBe(1);
	});

	test("reaches Henry Ford by the end of the forecast window", () => {
		expect(runStateAt(RUN_MONTHS).tier).toBe(4);
	});

	test("the top tier is visible for more than a single slider tick", () => {
		const ticks = [];
		for (let m = 0; m <= SLIDER_MONTHS; m += 0.25) ticks.push(runStateAt(m));
		expect(ticks.filter((state) => state.tier === 4).length).toBeGreaterThan(1);
	});

	test("the badge never moves backwards", () => {
		let previous = 0;
		for (let m = 0; m <= SLIDER_MONTHS; m += 0.25) {
			const { tier } = runStateAt(m);
			expect(tier).toBeGreaterThanOrEqual(previous);
			previous = tier;
		}
	});

	test("progress stays inside the bar", () => {
		for (let m = 0; m <= SLIDER_MONTHS; m += 0.5) {
			const { progress } = runStateAt(m);
			expect(progress).toBeGreaterThanOrEqual(0);
			expect(progress).toBeLessThanOrEqual(1);
		}
	});

	test("every axis reports which one is holding the tier back", () => {
		for (let m = 0; m <= RUN_MONTHS; m += 1) {
			expect(runStateAt(m).limitedBy.length).toBeGreaterThan(0);
		}
	});

	test("shipping gets cheaper every month even as sessions get bigger", () => {
		for (let m = 1; m <= RUN_MONTHS; m += 1) {
			expect(runStateAt(m).costPerPr).toBeLessThan(runStateAt(m - 1).costPerPr);
			expect(runStateAt(m).depth).toBeGreaterThan(runStateAt(m - 1).depth);
		}
	});
});

describe("the figures printed on the page", () => {
	const start = runStateAt(0);
	const end = runStateAt(RUN_MONTHS);

	test("cost per session runs $3.75 to $1.62, 57% cheaper", () => {
		expect(start.costPerSession).toBeCloseTo(3.75, 2);
		expect(end.costPerSession).toBeCloseTo(1.62, 2);
		expect(1 - end.costPerSession / start.costPerSession).toBeCloseTo(0.57, 2);
	});

	test("cost per merged PR runs $15.00 to $3.23, 4.6x cheaper", () => {
		expect(start.costPerPr).toBeCloseTo(15, 2);
		expect(end.costPerPr).toBeCloseTo(3.23, 2);
		expect(start.costPerPr / end.costPerPr).toBeCloseTo(4.6, 1);
	});

	test("tokens per session grow 10.8x and per merged PR 5.4x", () => {
		expect(end.depth / start.depth).toBeCloseTo(10.8, 1);
		const perPr = (state: typeof start) => state.sessionsPerPr * state.depth;
		expect(perPr(end) / perPr(start)).toBeCloseTo(5.4, 1);
	});

	test("deflation supplies 2.3x of the saving and rework the other 2x", () => {
		const deflation =
			start.pricePerMtok / end.pricePerMtok / (end.depth / start.depth);
		const rework = start.sessionsPerPr / end.sessionsPerPr;
		expect(deflation).toBeCloseTo(2.32, 1);
		expect(rework).toBeCloseTo(2, 2);
		expect(deflation * rework).toBeCloseTo(start.costPerPr / end.costPerPr, 5);
	});

	test("the weekly bill roughly doubles while the per-change cost falls", () => {
		const weekly = (state: typeof start) => state.output * state.costPerPr;
		expect(weekly(start)).toBeCloseTo(15, 0);
		expect(weekly(end)).toBeCloseTo(35, 0);
	});

	test("prices fall by the stated multiple every year", () => {
		expect(pricePerMtok(0)).toBe(PRICE_PER_MTOK_TODAY);
		expect(pricePerMtok(12)).toBeCloseTo(
			PRICE_PER_MTOK_TODAY / PRICE_DECLINE_PER_YEAR,
			6,
		);
		expect(pricePerMtok(24)).toBeCloseTo(
			PRICE_PER_MTOK_TODAY / PRICE_DECLINE_PER_YEAR ** 2,
			6,
		);
	});
});

describe("published gates match the graded floors", () => {
	test("every tier quotes width, output, sustain and cost verbatim", () => {
		for (let tier = 1; tier <= 4; tier++) {
			expect(gate(tier, "Width")).toBe(String(FLOORS.width[tier - 1]));
			expect(gate(tier, "Sustain")).toBe(`${FLOORS.sustain[tier - 1]}/30`);
			expect(money(gate(tier, "Cost"))).toBe(COST_CEILINGS[tier - 1] ?? 0);
			if (tier > 1) {
				expect(gate(tier, "Output")).toBe(`${FLOORS.output[tier - 1]}/wk`);
				expect(tokens(gate(tier, "Depth"))).toBe(FLOORS.depth[tier - 1] ?? 0);
			}
		}
	});

	test("the bottom rung grades presence only", () => {
		expect(gate(1, "Depth")).toBe("none");
		expect(gate(1, "Output")).toBe("none");
	});

	test("every graded axis appears on every tier", () => {
		const axes = GRADED_AXES.map((axis) => axis.name).sort();
		type Axis = (typeof PRODUCTION_TIERS)[number]["gates"][number]["axis"];
		for (const tier of PRODUCTION_TIERS) {
			expect(tier.gates.map((entry) => entry.axis).sort()).toEqual(
				axes as Axis[],
			);
		}
	});
});

describe("run targets", () => {
	const run = RUNS[0];

	test("a run asks for every axis it will be graded on", () => {
		expect(run?.targets.map((target) => target.axis).sort()).toEqual(
			GRADED_AXES.map((axis) => axis.name).sort(),
		);
	});

	test("hitting the published targets actually clears Operator", () => {
		const cost = run?.targets.find((target) => target.axis === "Cost");
		expect(money(cost?.value ?? "")).toBeLessThanOrEqual(COST_CEILINGS[1] ?? 0);

		const width = run?.targets.find((target) => target.axis === "Width");
		expect(Number.parseFloat(width?.value ?? "0")).toBeGreaterThanOrEqual(
			FLOORS.width[1] ?? 0,
		);

		const depth = run?.targets.find((target) => target.axis === "Depth");
		expect(tokens(depth?.value ?? "")).toBeGreaterThanOrEqual(
			FLOORS.depth[1] ?? 0,
		);

		const sustain = run?.targets.find((target) => target.axis === "Sustain");
		expect(Number.parseFloat(sustain?.value ?? "0")).toBeGreaterThanOrEqual(
			FLOORS.sustain[1] ?? 0,
		);
	});

	test("each run mints its own rewards", () => {
		for (const entry of RUNS) {
			expect(entry.rewards.length).toBeGreaterThan(0);
			expect(new Set(entry.rewards.map((reward) => reward.kind)).size).toBe(
				entry.rewards.length,
			);
		}
	});
});

describe("runStatus", () => {
	const run = RUNS[0];

	test("reads upcoming, active and complete around the window", () => {
		if (!run) throw new Error("expected at least one run");
		expect(runStatus(run, new Date("2026-08-31T12:00:00Z"))).toBe("upcoming");
		expect(runStatus(run, new Date("2026-09-01T00:00:00Z"))).toBe("active");
		expect(runStatus(run, new Date("2026-09-30T23:00:00Z"))).toBe("active");
		expect(runStatus(run, new Date("2026-10-01T00:00:00Z"))).toBe("complete");
	});

	test("an upcoming run names its start date", () => {
		if (!run) throw new Error("expected at least one run");
		expect(runStatusLabel("upcoming", run)).toBe("starts September 1");
		expect(runStatusLabel("active", run)).toBe("happening now");
		expect(runStatusLabel("complete", run)).toBe("complete");
	});

	test("the status text and its date follow the active locale", async () => {
		if (!run) throw new Error("expected at least one run");
		try {
			// Non-English catalogs load lazily; wait for Japanese before asserting.
			await initI18nAsync("ja");
			expect(runStatusLabel("active", run)).toBe("開催中");
			expect(runStatusLabel("upcoming", run)).toBe("9月1日 開始");
		} finally {
			initI18n("en");
		}
	});
});

describe("the forecast table", () => {
	test("every row is a whole population", () => {
		for (const point of TRAJECTORY) {
			expect(point.shares.reduce((sum, share) => sum + share, 0)).toBe(100);
		}
		expect(MEASURED_TODAY.reduce((sum, share) => sum + share, 0)).toBe(100);
	});

	test("August 2028 backs the headline: one in five at the top, median below it", () => {
		const last = TRAJECTORY[TRAJECTORY.length - 1];
		if (!last) throw new Error("expected a final trajectory point");
		expect(last.shares[3]).toBeGreaterThan(20);

		let cumulative = 0;
		let median = 0;
		last.shares.forEach((share, index) => {
			cumulative += share;
			if (median === 0 && cumulative >= 50) median = index + 1;
		});
		expect(median).toBe(3);
	});

	test("the measured board is nowhere near the forecast it sits under", () => {
		expect(MEASURED_TODAY[0]).toBeGreaterThan(99);
		expect(TRAJECTORY[0]?.shares[0]).toBeLessThan(80);
	});
});

describe("monthLabel", () => {
	test("counts months from the start of the forecast", () => {
		expect(monthLabel(0)).toBe("Aug 2026");
		expect(monthLabel(12)).toBe("Aug 2027");
		expect(monthLabel(RUN_MONTHS)).toBe("Aug 2028");
	});
});
