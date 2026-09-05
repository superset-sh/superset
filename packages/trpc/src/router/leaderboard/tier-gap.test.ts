import { describe, expect, test } from "bun:test";
import {
	ANCHORS,
	type AxisValues,
	BANDS,
	blockingAxes,
	factoryScore,
	scoredGaps,
	type Tier,
	tierGap,
} from "./tier";

const at = (axis: keyof typeof ANCHORS, band: number) => {
	const [low, high] = ANCHORS[axis];
	return low * (high / low) ** (band / 100);
};

const AT_TIER_1: AxisValues = {
	width: 1,
	depth: 3_100_000,
	output: 0,
	sustain: 12,
	cost: 0,
};

describe("tierGap", () => {
	test("reports all five axes", () => {
		expect(tierGap(AT_TIER_1, 1).map((gap) => gap.axis)).toEqual([
			"width",
			"depth",
			"output",
			"sustain",
			"cost",
		]);
	});

	test("targets the value that scores at the next band", () => {
		const byAxis = Object.fromEntries(
			tierGap(AT_TIER_1, 1).map((gap) => [gap.axis, gap]),
		);
		const band = BANDS[0] ?? 0;

		expect(byAxis.width?.needed).toBeCloseTo(at("width", band), 1);
		expect(byAxis.depth?.needed).toBeCloseTo(at("depth", band), -4);
		expect(byAxis.output?.needed).toBeCloseTo(at("output", band), 1);
		expect(byAxis.sustain?.needed).toBeCloseTo(at("sustain", band), 1);
		expect(byAxis.cost?.needed).toBeLessThan(ANCHORS.cost[0]);
	});

	test("an axis is met when it scores at the band it is aiming for", () => {
		const byAxis = Object.fromEntries(
			tierGap({ ...AT_TIER_1, sustain: 26 }, 1).map((gap) => [gap.axis, gap]),
		);

		expect(byAxis.sustain?.met).toBe(true);
		expect(byAxis.width?.met).toBe(false);
		expect(byAxis.output?.met).toBe(false);
	});

	test("lists the lagging axes weakest first", () => {
		const blocking = blockingAxes(AT_TIER_1, 1);
		expect(blocking).toContain("width");
		expect(blocking).not.toContain("output");
		expect(blocking).not.toContain("cost");

		const { parts } = factoryScore(AT_TIER_1);
		const scores = blocking.map((axis) => parts[axis]);
		expect(scores).toEqual([...scores].sort((a, b) => a - b));
	});

	test("treats cost as lower-is-better", () => {
		const cheap = tierGap({ ...AT_TIER_1, cost: 5 }, 1).find(
			(gap) => gap.axis === "cost",
		);
		const dear = tierGap({ ...AT_TIER_1, cost: 40 }, 1).find(
			(gap) => gap.axis === "cost",
		);

		expect(cheap?.met).toBe(true);
		expect(cheap?.lowerIsBetter).toBe(true);
		expect(dear?.met).toBe(true);

		expect(
			factoryScore({ ...AT_TIER_1, output: 1, cost: 5 }).parts.cost,
		).toBeGreaterThan(
			factoryScore({ ...AT_TIER_1, output: 1, cost: 400 }).parts.cost,
		);
	});

	test("an unmeasured cost is not a free pass", () => {
		const gap = tierGap({ ...AT_TIER_1, cost: 0 }, 1).find(
			(g) => g.axis === "cost",
		);
		expect(gap?.met).toBe(false);
	});

	test("carries current values through for display", () => {
		const width = tierGap(AT_TIER_1, 1).find((gap) => gap.axis === "width");
		expect(width?.current).toBe(1);
		expect(width?.needed).toBeCloseTo(at("width", BANDS[0] ?? 0), 1);
	});

	test("clamps at the top tier rather than inventing a fifth", () => {
		const gaps = tierGap(AT_TIER_1, 4 as Tier);
		const width = gaps.find((gap) => gap.axis === "width");
		expect(width?.needed).toBeCloseTo(
			at("width", BANDS[BANDS.length - 1] ?? 0),
			1,
		);
		expect(gaps.every((gap) => gap.met)).toBe(true);
	});

	test("an unranked profile is measured against the first band", () => {
		const gaps = tierGap({ ...AT_TIER_1, sustain: 26 }, 0 as Tier);
		const sustain = gaps.find((gap) => gap.axis === "sustain");
		expect(sustain?.needed).toBeCloseTo(at("sustain", BANDS[0] ?? 0), 1);
		expect(sustain?.met).toBe(true);
	});

	test("everything met means nothing is blocking", () => {
		const strong: AxisValues = {
			width: 10,
			depth: 50_000_000,
			output: 10,
			sustain: 30,
			cost: 1,
		};
		expect(blockingAxes(strong, 1)).toEqual([]);
	});
});

describe("scored axes track output and cost independently", () => {
	const measured: AxisValues = {
		width: 4,
		depth: 8_000_000,
		output: 3,
		sustain: 20,
		cost: 400,
	};

	test("a profile with no merged PRs is scored on the three axes it has", () => {
		const { scored } = factoryScore({ ...measured, output: 0, cost: 0 });
		expect(scored).toEqual(["width", "depth", "sustain"]);
		expect(scoredGaps({ ...measured, output: 0, cost: 0 }, 1)).toHaveLength(3);
	});

	test("a zero output median does not drop a real cost from the score", () => {
		const { scored } = factoryScore({ ...measured, output: 0 });
		expect(scored).toEqual(["width", "depth", "sustain", "cost"]);
		expect(
			scoredGaps({ ...measured, output: 0 }, 1).map((gap) => gap.axis),
		).toContain("cost");
	});

	test("cost still scores on its own when output is present", () => {
		expect(factoryScore(measured).scored).toEqual([
			"width",
			"depth",
			"output",
			"sustain",
			"cost",
		]);
	});

	test("tierGap flags which axes were scored without dropping the rest", () => {
		const gaps = tierGap({ ...measured, output: 0, cost: 0 }, 1);
		expect(gaps).toHaveLength(5);
		expect(gaps.filter((gap) => gap.scored).map((gap) => gap.axis)).toEqual([
			"width",
			"depth",
			"sustain",
		]);
	});
});
