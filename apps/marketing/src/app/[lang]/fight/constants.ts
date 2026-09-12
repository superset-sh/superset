import type { Fighter } from "./utils/simulateFight";

export const HOUSE_FIGHTERS: readonly Fighter[] = [
	{
		handle: "tokengoblin",
		name: "Token Goblin",
		tier: 2,
		axes: { width: 2.1, depth: 31_000_000, output: 2, sustain: 24, cost: 1140 },
	},
	{
		handle: "shipfast",
		name: "Ship Fast",
		tier: 3,
		axes: { width: 9.4, depth: 4_200_000, output: 11, sustain: 29, cost: 410 },
	},
	{
		handle: "rebaselord",
		name: "Rebase Lord",
		tier: 2,
		axes: { width: 3.2, depth: 12_400_000, output: 4, sustain: 21, cost: 780 },
	},
	{
		handle: "yolomerge",
		name: "Yolo Merge",
		tier: 1,
		axes: { width: 5, depth: 26_000_000, output: 6, sustain: 11, cost: 1320 },
	},
	{
		handle: "budgethawk",
		name: "Budget Hawk",
		tier: 2,
		axes: { width: 2.6, depth: 6_800_000, output: 3, sustain: 27, cost: 320 },
	},
	{
		handle: "nightowl",
		name: "Night Owl",
		tier: 4,
		axes: {
			width: 10.2,
			depth: 38_500_000,
			output: 12,
			sustain: 30,
			cost: 340,
		},
	},
] as const;

export const DEFAULT_MATCHUP = ["tokengoblin", "shipfast"] as const;

export const AXES = [
	{
		key: "depth",
		label: "DEPTH",
		stat: "POWER",
		max: 40_000_000,
		unit: "tok/session",
	},
	{ key: "width", label: "WIDTH", stat: "SWINGS", max: 12, unit: "parallel" },
	{ key: "output", label: "OUTPUT", stat: "CRIT", max: 14, unit: "PRs/week" },
	{
		key: "sustain",
		label: "SUSTAIN",
		stat: "HP",
		max: 30,
		unit: "active days",
	},
	{
		key: "cost",
		label: "COST",
		stat: "ARMOR",
		max: 15,
		unit: "$/PR",
		lowerIsBetter: true,
	},
] as const;

export type AxisMeta = (typeof AXES)[number];
