export const ACHIEVEMENT_GRID = 9;

export const CATALOG_VERSION = 2;

export const DAY_ONE_COHORT = 100;

export const RUN_01 = {
	from: "2026-09-01",
	to: "2026-09-30",
	tier: 2,
} as const;

export type AchievementKind = "badge" | "milestone";

export type AchievementAxis =
	| "output"
	| "width"
	| "depth"
	| "sustain"
	| "cost"
	| "run"
	| "cohort"
	| "volume";

export type AchievementMeasure =
	| "lifetimeAgentPrs"
	| "daysAtWidth2"
	| "daysAtWidth3"
	| "axisDepth"
	| "longestStreak"
	| "axisCost"
	| "clearedRun01"
	| "isDayOne"
	| "tokens"
	| "usd"
	| "sessions";

export interface AchievementDef {
	slug: string;
	kind: AchievementKind;
	axis: AchievementAxis;
	measure: AchievementMeasure;
	thresholds: readonly number[];
	lowerIsBetter: boolean;
	art: readonly string[] | null;
	retiredAt: string | null;
}

const SHIP_IT = [
	"#########",
	"#.......#",
	"#...#...#",
	"#....#..#",
	"#.#####.#",
	"#....#..#",
	"#...#...#",
	"#.......#",
	"#########",
] as const;

const TWO_HANDS = [
	"#########",
	"#.......#",
	"#.##.##.#",
	"#.##.##.#",
	"#.##.##.#",
	"#.##.##.#",
	"#.##.##.#",
	"#.......#",
	"#########",
] as const;

const PLANT_FLOOR = [
	"#########",
	"#.......#",
	"#.#.#.#.#",
	"#.#.#.#.#",
	"#.#.#.#.#",
	"#.#.#.#.#",
	"#.#.#.#.#",
	"#.......#",
	"#########",
] as const;

const WHOLE_TASK = [
	"#########",
	"#.......#",
	"#...#...#",
	"#...#...#",
	"#.#####.#",
	"#..###..#",
	"#...#...#",
	"#.......#",
	"#########",
] as const;

const THIRTY = [
	"#########",
	"#.......#",
	"#.#.#.#.#",
	"#.......#",
	"#.#.#.#.#",
	"#.......#",
	"#.#.#.#.#",
	"#.......#",
	"#########",
] as const;

const EFFICIENT = [
	"#########",
	"#.......#",
	"#.#####.#",
	"#.####..#",
	"#.###...#",
	"#.##....#",
	"#.#.....#",
	"#.......#",
	"#########",
] as const;

const RUN_SEAL = [
	"#########",
	"#.......#",
	"#.#####.#",
	"#.#...#.#",
	"#.#.#.#.#",
	"#.#...#.#",
	"#.#####.#",
	"#.......#",
	"#########",
] as const;

const DAY_ONE = [
	"#########",
	"#.......#",
	"#.......#",
	"#..###..#",
	"#..###..#",
	"#..###..#",
	"#.......#",
	"#.......#",
	"#########",
] as const;

export const CATALOG: readonly AchievementDef[] = [
	{
		slug: "ship-it",
		kind: "badge",
		axis: "output",
		measure: "lifetimeAgentPrs",
		thresholds: [1, 10, 100, 1000],
		lowerIsBetter: false,
		art: SHIP_IT,
		retiredAt: null,
	},
	{
		slug: "two-hands",
		kind: "badge",
		axis: "width",
		measure: "daysAtWidth2",
		thresholds: [10, 30, 100],
		lowerIsBetter: false,
		art: TWO_HANDS,
		retiredAt: null,
	},
	{
		slug: "plant-floor",
		kind: "badge",
		axis: "width",
		measure: "daysAtWidth3",
		thresholds: [10, 30, 100],
		lowerIsBetter: false,
		art: PLANT_FLOOR,
		retiredAt: null,
	},
	{
		slug: "whole-task",
		kind: "badge",
		axis: "depth",
		measure: "axisDepth",
		thresholds: [2_500_000, 10_000_000, 40_000_000],
		lowerIsBetter: false,
		art: WHOLE_TASK,
		retiredAt: null,
	},
	{
		slug: "thirty",
		kind: "badge",
		axis: "sustain",
		measure: "longestStreak",
		thresholds: [30, 100, 365],
		lowerIsBetter: false,
		art: THIRTY,
		retiredAt: null,
	},
	{
		slug: "efficient",
		kind: "badge",
		axis: "cost",
		measure: "axisCost",
		thresholds: [750, 300, 100],
		lowerIsBetter: true,
		art: EFFICIENT,
		retiredAt: null,
	},
	{
		slug: "run-01",
		kind: "badge",
		axis: "run",
		measure: "clearedRun01",
		thresholds: [],
		lowerIsBetter: false,
		art: RUN_SEAL,
		retiredAt: null,
	},
	{
		slug: "day-one",
		kind: "badge",
		axis: "cohort",
		measure: "isDayOne",
		thresholds: [],
		lowerIsBetter: false,
		art: DAY_ONE,
		retiredAt: null,
	},
	{
		slug: "tokens",
		kind: "milestone",
		axis: "volume",
		measure: "tokens",
		thresholds: [10_000_000, 100_000_000, 1_000_000_000, 10_000_000_000],
		lowerIsBetter: false,
		art: null,
		retiredAt: null,
	},
	{
		slug: "spend",
		kind: "milestone",
		axis: "volume",
		measure: "usd",
		thresholds: [100, 1_000, 10_000],
		lowerIsBetter: false,
		art: null,
		retiredAt: null,
	},
	{
		slug: "sessions",
		kind: "milestone",
		axis: "volume",
		measure: "sessions",
		thresholds: [100, 500, 1_000, 5_000],
		lowerIsBetter: false,
		art: null,
		retiredAt: null,
	},
];

export const BADGES = CATALOG.filter((entry) => entry.kind === "badge");
export const MILESTONES = CATALOG.filter((entry) => entry.kind === "milestone");

export const CATALOG_BY_SLUG: Record<string, AchievementDef> =
	Object.fromEntries(CATALOG.map((entry) => [entry.slug, entry]));

export function earnedTier(def: AchievementDef, value: number): number {
	if (def.thresholds.length === 0) return 0;

	let earned = 0;
	for (let index = 0; index < def.thresholds.length; index++) {
		const threshold = def.thresholds[index];
		if (threshold === undefined) continue;
		const met = def.lowerIsBetter
			? value > 0 && value <= threshold
			: value >= threshold;
		if (met) earned = index + 1;
	}
	return earned;
}

export function isRetired(def: AchievementDef, on: string): boolean {
	return def.retiredAt !== null && on > def.retiredAt;
}

export function totalAwardableRows(
	on: string,
	catalog: readonly AchievementDef[] = CATALOG,
): number {
	return catalog
		.filter((def) => !isRetired(def, on))
		.reduce((sum, def) => sum + Math.max(1, def.thresholds.length), 0);
}

export interface HeldAward {
	slug: string;
	tier: number;
	awardedOn: string;
}

export function highestPerSlug(awards: readonly HeldAward[]): HeldAward[] {
	const best = new Map<string, HeldAward>();

	for (const award of awards) {
		const held = best.get(award.slug);
		if (!held) {
			best.set(award.slug, award);
			continue;
		}
		if (award.tier > held.tier) {
			best.set(award.slug, award);
			continue;
		}
		if (award.tier === held.tier && award.awardedOn < held.awardedOn) {
			best.set(award.slug, award);
		}
	}

	return [...best.values()];
}

const CURRENCY_MEASURES = new Set<AchievementMeasure>(["axisCost", "usd"]);

export const isCurrencyAward = (def: AchievementDef): boolean =>
	CURRENCY_MEASURES.has(def.measure);
