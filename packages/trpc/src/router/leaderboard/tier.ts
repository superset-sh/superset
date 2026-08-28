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
	depth: [0, 500_000, 2_000_000, 8_000_000],
	output: [0, 1, 3, 10],
	sustain: [8, 10, 15, 20],
} as const;

const MIN_ACTIVE_DAYS = FLOORS.sustain[0];
const PROMOTE_SHARE = 0.6;
const DEMOTE_SHARE = 0.4;
const OUTPUT_WINDOW_DAYS = 7;

function floorTier(value: number, floors: readonly number[]): Tier {
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

export interface FactoryDayRow {
	day: string;
	tokens: number;
	sessions: number;
	parallelSessions: number;
	agentPrsMerged: number;
}

export interface TierResult {
	tier: Tier;
	activeDays: number;
	axisWidth: number;
	axisDepth: number;
	axisOutput: number;

	limitedBy: Array<"width" | "depth" | "output" | "sustain">;
}

const UNRANKED: TierResult = {
	tier: 0,
	activeDays: 0,
	axisWidth: 0,
	axisDepth: 0,
	axisOutput: 0,
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
	const dailyTiers: Tier[] = [];

	for (let i = 0; i < active.length; i++) {
		const row = active[i];
		if (!row) continue;
		const depth = row.sessions > 0 ? row.tokens / row.sessions : 0;
		const output = trailingOutput(active, i);
		widths.push(row.parallelSessions);
		depths.push(depth);
		outputs.push(output);
		dailyTiers.push(
			Math.min(
				widthTier(row.parallelSessions),
				depthTier(depth),
				outputTier(output),
			) as Tier,
		);
	}

	const share = (tier: number) =>
		dailyTiers.filter((t) => t >= tier).length / activeDays;

	let promotable = 0;
	let held = 0;
	for (let tier = 4; tier >= 1; tier--) {
		if (promotable === 0 && share(tier) >= PROMOTE_SHARE) promotable = tier;
		if (held === 0 && share(tier) >= DEMOTE_SHARE) held = tier;
	}

	const dayTier =
		promotable > previousTier
			? promotable
			: held < previousTier
				? held
				: previousTier;

	const sustain = sustainTier(activeDays);
	const tier = Math.min(dayTier, sustain) as Tier;

	const axisWidth = median(widths);
	const axisDepth = median(depths);
	const axisOutput = median(outputs);

	const limitedBy: TierResult["limitedBy"] = [];
	if (tier < 4) {
		if (widthTier(axisWidth) === tier) limitedBy.push("width");
		if (depthTier(axisDepth) === tier) limitedBy.push("depth");
		if (outputTier(axisOutput) === tier) limitedBy.push("output");
		if (sustain === tier) limitedBy.push("sustain");
	}

	return {
		tier,
		activeDays,
		axisWidth: Number(axisWidth.toFixed(2)),
		axisDepth: Math.round(axisDepth),
		axisOutput: Number(axisOutput.toFixed(2)),
		limitedBy,
	};
}

export interface AxisValues {
	width: number;
	depth: number;
	output: number;
	sustain: number;
}

export function tierProgress(values: AxisValues, tier: Tier): number {
	if (tier <= 0) return 0;
	if (tier >= 4) return 1;

	const axes: Array<[number, readonly number[]]> = [
		[values.width, FLOORS.width],
		[values.depth, FLOORS.depth],
		[values.output, FLOORS.output],
		[values.sustain, FLOORS.sustain],
	];

	let lowest = 1;
	for (const [value, floors] of axes) {
		const from = floors[tier - 1] ?? 0;
		const to = floors[tier] ?? from;
		const span = to - from;
		const progress =
			span <= 0 ? 1 : Math.min(1, Math.max(0, (value - from) / span));
		lowest = Math.min(lowest, progress);
	}
	return Number(lowest.toFixed(3));
}
