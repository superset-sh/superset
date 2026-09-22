export const TIER_NAMES = [
	"Button pusher",
	"Operator",
	"Plant Manager",
	"Henry Ford",
] as const;

export type TierName = (typeof TIER_NAMES)[number];

export type Tier = 0 | 1 | 2 | 3 | 4;

export const tierName = (tier: Tier): TierName | null =>
	tier === 0 ? null : (TIER_NAMES[tier - 1] ?? null);

export const FLOORS = {
	width: [1, 2, 3, 10],
	depth: [0, 2_500_000, 10_000_000, 40_000_000],
	output: [0, 1, 3, 10],
	sustain: [8, 10, 15, 20],
} as const;

export interface AxisValues {
	width: number;
	depth: number;
	output: number;
	sustain: number;
	cost: number;
}

export type AxisName = keyof AxisValues;

export const COST_CEILINGS: readonly number[] = [2000, 750, 300, 100];

export const ANCHORS = {
	width: [1, 8],
	depth: [2_000_000, 40_000_000],
	output: [0.25, 12],
	sustain: [8, 30],
	cost: [3000, 50],
} as const satisfies Record<AxisName, readonly [number, number]>;

export const WEIGHTS = {
	width: 0.28,
	depth: 0.28,
	output: 0.22,
	sustain: 0.07,
	cost: 0.15,
} as const satisfies Record<AxisName, number>;

export const BANDS: readonly number[] = [55, 82, 88];

const DEMOTE_MARGIN = 3;

export function axisScore(
	value: number,
	low: number,
	high: number,
	lowerIsBetter = false,
): number {
	if (lowerIsBetter) {
		if (!Number.isFinite(value) || value <= 0) return 0;
		if (value >= low) return 0;
		if (value <= high) return 1;
		return Math.log(low / value) / Math.log(low / high);
	}
	if (!Number.isFinite(value) || value <= 0) return 0;
	if (value <= low) return 0;
	return Math.min(1, Math.log(value / low) / Math.log(high / low));
}

export interface FactoryScore {
	score: number;
	parts: Record<AxisName, number>;
	scored: AxisName[];
}

export function factoryScore(values: AxisValues): FactoryScore {
	const parts: Record<AxisName, number> = {
		width: axisScore(values.width, ANCHORS.width[0], ANCHORS.width[1]),
		depth: axisScore(values.depth, ANCHORS.depth[0], ANCHORS.depth[1]),
		output: axisScore(values.output, ANCHORS.output[0], ANCHORS.output[1]),
		sustain: axisScore(values.sustain, ANCHORS.sustain[0], ANCHORS.sustain[1]),
		cost: axisScore(values.cost, ANCHORS.cost[0], ANCHORS.cost[1], true),
	};

	const scored = (Object.keys(parts) as AxisName[]).filter(
		(axis) =>
			(axis !== "output" || values.output > 0) &&
			(axis !== "cost" || values.cost > 0),
	);

	let weighted = 0;
	let total = 0;
	for (const axis of scored) {
		weighted += WEIGHTS[axis] * parts[axis];
		total += WEIGHTS[axis];
	}

	return {
		score: total > 0 ? Number(((100 * weighted) / total).toFixed(2)) : 0,
		parts,
		scored,
	};
}

export function bandTier(score: number): Tier {
	let tier = 1;
	for (let i = 0; i < BANDS.length; i++) {
		if (score >= (BANDS[i] ?? Number.POSITIVE_INFINITY)) tier = i + 2;
	}
	return tier as Tier;
}

export const MIN_ACTIVE_DAYS = FLOORS.sustain[0];
const OUTPUT_WINDOW_DAYS = 7;

export function floorTier(value: number, floors: readonly number[]): Tier {
	let tier = 0;
	for (let i = 0; i < floors.length; i++) {
		if (value >= (floors[i] ?? Number.POSITIVE_INFINITY)) tier = i + 1;
	}
	return tier as Tier;
}

export const widthTier = (parallelSessions: number): Tier =>
	floorTier(parallelSessions, FLOORS.width);
export const depthTier = (tokensPerSession: number): Tier =>
	floorTier(tokensPerSession, FLOORS.depth);
export const outputTier = (agentPrsPerWeek: number): Tier =>
	floorTier(agentPrsPerWeek, FLOORS.output);
export const sustainTier = (activeDays: number): Tier =>
	floorTier(activeDays, FLOORS.sustain);

export const costTier = (usdPerMergedPr: number): Tier => {
	if (!Number.isFinite(usdPerMergedPr) || usdPerMergedPr <= 0) return 0;
	let tier: Tier = 0;
	for (let i = 0; i < COST_CEILINGS.length; i++) {
		if (usdPerMergedPr <= (COST_CEILINGS[i] ?? Number.NEGATIVE_INFINITY)) {
			tier = (i + 1) as Tier;
		}
	}
	return tier;
};

export interface FactoryDayRow {
	day: string;
	tokens: number;
	sessions: number;
	parallelSessions: number;
	agentPrsMerged: number;
	agentPrsAllHosts: number;
	usd: number;
}

export interface TierResult {
	tier: Tier;
	activeDays: number;
	score: number;
	axisWidth: number;
	axisDepth: number;
	axisOutput: number;
	axisCost: number;

	limitedBy: Array<"width" | "depth" | "output" | "sustain" | "cost">;
}

const UNRANKED: TierResult = {
	tier: 0,
	activeDays: 0,
	score: 0,
	axisWidth: 0,
	axisDepth: 0,
	axisOutput: 0,
	axisCost: 0,
	limitedBy: ["sustain"],
};

function median(values: number[]): number {
	if (values.length === 0) return 0;
	const sorted = [...values].sort((a, b) => a - b);
	const mid = sorted.length >> 1;
	if (sorted.length % 2 === 1) return sorted[mid] ?? 0;
	return ((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2;
}

const dayIndex = (day: string) =>
	Math.floor(Date.parse(`${day}T00:00:00Z`) / 86_400_000);

function trailingOutput(rows: FactoryDayRow[], at: number): number {
	const end = dayIndex(rows[at]?.day ?? "");
	let total = 0;
	for (let i = at; i >= 0; i--) {
		const row = rows[i];
		if (!row) break;
		if (end - dayIndex(row.day) >= OUTPUT_WINDOW_DAYS) break;
		total += row.agentPrsMerged;
	}
	return total;
}

export function computeTier(
	rows: FactoryDayRow[],
	previousTier: Tier = 0,
): TierResult {
	const active = [...rows].sort((a, b) => (a.day < b.day ? -1 : 1));
	const activeDays = active.length;
	if (activeDays < MIN_ACTIVE_DAYS) return { ...UNRANKED, activeDays };

	const widths: number[] = [];
	const depths: number[] = [];
	const outputs: number[] = [];

	for (let i = 0; i < active.length; i++) {
		const row = active[i];
		if (!row) continue;
		widths.push(row.parallelSessions);
		depths.push(row.sessions > 0 ? row.tokens / row.sessions : 0);
		outputs.push(trailingOutput(active, i));
	}

	const windowUsd = active.reduce((sum, row) => sum + row.usd, 0);
	const windowPrs = active.reduce((sum, row) => sum + row.agentPrsAllHosts, 0);

	const axisWidth = median(widths);
	const axisDepth = median(depths);
	const axisOutput = median(outputs);
	const axisCost = windowPrs > 0 ? windowUsd / windowPrs : 0;

	const values: AxisValues = {
		width: axisWidth,
		depth: axisDepth,
		output: axisOutput,
		sustain: activeDays,
		cost: axisCost,
	};

	const { score, parts, scored } = factoryScore(values);
	const banded = bandTier(score);

	let tier: Tier = banded;
	if (banded < previousTier) {
		const floor = BANDS[previousTier - 2];
		tier =
			floor !== undefined && score >= floor - DEMOTE_MARGIN
				? previousTier
				: banded;
	}

	if (axisCost > 0) {
		const capped = Math.max(1, costTier(axisCost)) as Tier;
		if (capped < tier) tier = capped;
	}

	const sustain = sustainTier(activeDays);
	if (sustain < tier) tier = sustain;

	const limitedBy =
		tier < 4
			? ([...scored]
					.sort((a, b) => parts[a] - parts[b])
					.filter((axis) => parts[axis] < 1)
					.slice(0, 3) as TierResult["limitedBy"])
			: [];

	return {
		tier,
		activeDays,
		score,
		axisWidth: Number(axisWidth.toFixed(2)),
		axisDepth: Math.round(axisDepth),
		axisOutput: Number(axisOutput.toFixed(2)),
		axisCost: Number(axisCost.toFixed(2)),
		limitedBy,
	};
}

export interface AxisGap {
	axis: AxisName;
	current: number;
	needed: number;
	met: boolean;
	scored: boolean;
	lowerIsBetter: boolean;
}

export function tierGap(values: AxisValues, tier: Tier): AxisGap[] {
	const { parts, scored } = factoryScore(values);
	const target =
		(BANDS[Math.min(BANDS.length - 1, Math.max(0, tier - 1))] ?? 0) / 100;

	return (Object.keys(WEIGHTS) as AxisName[]).map((axis) => {
		const [low, high] = ANCHORS[axis];
		const needed = low * (high / low) ** target;
		const lowerIsBetter = axis === "cost";

		return {
			axis,
			current: values[axis],
			needed: Number(needed.toFixed(axis === "depth" ? 0 : 2)),
			met: tier >= 4 || parts[axis] >= target,
			scored: scored.includes(axis),
			lowerIsBetter,
		};
	});
}

export function scoredGaps(values: AxisValues, tier: Tier): AxisGap[] {
	return tierGap(values, tier).filter((gap) => gap.scored);
}

export function rankingGap(values: AxisValues): AxisGap {
	return {
		axis: "sustain",
		current: values.sustain,
		needed: MIN_ACTIVE_DAYS,
		met: values.sustain >= MIN_ACTIVE_DAYS,
		scored: true,
		lowerIsBetter: false,
	};
}

export function blockingAxes(values: AxisValues, tier: Tier): AxisName[] {
	if (tier >= 4) return [];
	const { score, parts, scored } = factoryScore(values);
	const target = BANDS[Math.min(BANDS.length - 1, Math.max(0, tier - 1))] ?? 0;
	if (score >= target) return [];
	return [...scored]
		.filter((axis) => parts[axis] < 1)
		.sort((a, b) => parts[a] - parts[b]);
}

export function tierProgress(values: AxisValues, tier: Tier): number {
	if (tier <= 0) return 0;
	if (tier >= 4) return 1;

	const { score } = factoryScore(values);
	const low = tier === 1 ? 0 : (BANDS[tier - 2] ?? 0);
	const high = BANDS[tier - 1] ?? low;
	if (high <= low) return 1;

	return Number(
		Math.min(1, Math.max(0, (score - low) / (high - low))).toFixed(3),
	);
}
