import { msg } from "@lingui/core/macro";
import { i18n } from "@superset/i18n";
import { formatDate } from "@superset/i18n/format";
import {
	COST_CEILINGS,
	costTier,
	FLOORS,
	floorTier,
	type Tier,
	tierProgress,
} from "@superset/trpc/leaderboard-tier";

export { COST_CEILINGS, FLOORS };

export interface MeasuredVariable {
	name: string;
	grain: "per day" | "window";
	definition: string;
	feeds: string;
}

export const MEASURED_VARIABLES: MeasuredVariable[] = [
	{
		name: "tokens",
		grain: "per day",
		definition: "All tokens across every session.",
		feeds: "Depth",
	},
	{
		name: "sessions",
		grain: "per day",
		definition: "Distinct sessions with activity.",
		feeds: "Depth",
	},
	{
		name: "parallelSessions",
		grain: "per day",
		definition:
			"Median distinct sessions active in the same 15-minute bucket, across the day's active buckets.",
		feeds: "Width",
	},
	{
		name: "agentPrsMerged",
		grain: "per day",
		definition:
			"PRs merged from a Superset workspace that ran an agent, or whose workspace has since been archived.",
		feeds: "Output",
	},
	{
		name: "activeDays",
		grain: "window",
		definition: "Days in the trailing 30 with any activity.",
		feeds: "Sustain",
	},
	{
		name: "usd",
		grain: "per day",
		definition: "API-equivalent cost of those tokens.",
		feeds: "Cost",
	},
];

export interface GradedAxis {
	name: string;
	source: string;
	rationale: string;
}

export const GRADED_AXES: GradedAxis[] = [
	{
		name: "Width",
		source: "parallelSessions",
		rationale:
			"How many agents you actually run at once. Counted by bucketing usage in time, so it never needs a session end time, which is deliberate: session ends are not reliably observable.",
	},
	{
		name: "Depth",
		source: "tokens / sessions",
		rationale:
			"Never tokens on their own. Because it is a ratio, spending more inside one session raises Depth but not Width, and opening more sessions raises Width but dilutes Depth. You have to change how you work to move either.",
	},
	{
		name: "Output",
		source: "agentPrsMerged",
		rationale:
			"Whether the work lands. Counted from PRs merged out of a Superset workspace that ran an agent. Hard to reach by accident; possible to fake on purpose, which is what the flag button is for.",
	},
	{
		name: "Sustain",
		source: "activeDays",
		rationale: "Whether this is your normal mode or a good week.",
	},
	{
		name: "Cost",
		source: "usd / agentPrsMerged",
		rationale:
			"Dollars per merged PR, the one axis where lower is better. Efficiency, not spend: burn twice the tokens to land the same change and you move down.",
	},
];

export interface TierGate {
	axis: "Width" | "Depth" | "Output" | "Sustain" | "Cost";
	value: string;
}

export interface ProductionTier {
	tier: 1 | 2 | 3 | 4;
	name: string;
	unit: string;
	description: string;
	gates: TierGate[];
	tell: string;
	medianEta: string;
}

export const PRODUCTION_TIERS: ProductionTier[] = [
	{
		tier: 1,
		name: "Button pusher",
		unit: "the line",
		description:
			"You are in the loop for every step. The agent writes, you read every line before it merges, and your throughput is bounded by your reading speed, which means the agent is not saving you the expensive part.",
		gates: [
			{ axis: "Width", value: "1" },
			{ axis: "Depth", value: "none" },
			{ axis: "Output", value: "none" },
			{ axis: "Sustain", value: "8/30" },
			{ axis: "Cost", value: "\u2264 $15" },
		],
		tell: "Close the laptop and nothing continues.",
		medianEta: "Where the board is today",
	},
	{
		tier: 2,
		name: "Operator",
		unit: "the task",
		description:
			"The real break, and it is psychological before it is technical. Starting a second session is admitting you cannot watch both. You stop reading keystrokes and start reading outcomes.",
		gates: [
			{ axis: "Width", value: "2" },
			{ axis: "Depth", value: "2.5M" },
			{ axis: "Output", value: "1/wk" },
			{ axis: "Sustain", value: "10/30" },
			{ axis: "Cost", value: "\u2264 $9" },
		],
		tell: "You have been surprised, well or badly, by a diff you did not watch get written.",
		medianEta: "Median tier by mid 2027",
	},
	{
		tier: 3,
		name: "Plant Manager",
		unit: "the queue",
		description:
			"Three streams through a workday means you are scheduling rather than executing. Your day becomes deciding what runs next and judging what came back. This is where serious teams are.",
		gates: [
			{ axis: "Width", value: "3" },
			{ axis: "Depth", value: "10M" },
			{ axis: "Output", value: "3/wk" },
			{ axis: "Sustain", value: "15/30" },
			{ axis: "Cost", value: "\u2264 $7" },
		],
		tell: "You run out of well-specified work before you run out of agent capacity.",
		medianEta: "Median tier by mid 2028",
	},
	{
		tier: 4,
		name: "Henry Ford",
		unit: "the decision",
		description:
			"Ten concurrent streams is past what a person can hold in working memory. Reaching this tier means you stopped holding it, and something else tracks state: agents reviewing agents, overnight runs, a queue that survives you closing the laptop.",
		gates: [
			{ axis: "Width", value: "10" },
			{ axis: "Depth", value: "40M" },
			{ axis: "Output", value: "10/wk" },
			{ axis: "Sustain", value: "20/30" },
			{ axis: "Cost", value: "\u2264 $3.50" },
		],
		tell: "Work completes while you sleep and is mergeable in the morning. You find out what shipped by reading, not by watching.",
		medianEta: "One in five by Aug 2028",
	},
];

export interface TrajectoryPoint {
	t: number;
	label: string;
	shares: [number, number, number, number];
}

export const TRAJECTORY: TrajectoryPoint[] = [
	{ t: 2026.583, label: "Aug ’26", shares: [70, 25, 5, 0] },
	{ t: 2027.083, label: "Feb ’27", shares: [58, 30, 11, 1] },
	{ t: 2027.583, label: "Aug ’27", shares: [44, 34, 19, 3] },
	{ t: 2028.083, label: "Feb ’28", shares: [27, 33, 31, 9] },
	{ t: 2028.583, label: "Aug ’28", shares: [13, 25, 40, 22] },
];

export const MEASURED_TODAY: [number, number, number, number] = [
	99.7, 0.3, 0, 0,
];

export const DOUBLING_MONTHS = 7;

export const RUN_MONTHS = 24;

export const SLIDER_MONTHS = 30;

const START = { width: 1, depth: 3_750_000, output: 1 } as const;

const ramped = (start: number, months: number) =>
	start * 2 ** (months / DOUBLING_MONTHS);

export const PRICE_PER_MTOK_TODAY = 1;

export const PRICE_DECLINE_PER_YEAR = 5;

export const pricePerMtok = (months: number) =>
	PRICE_PER_MTOK_TODAY / PRICE_DECLINE_PER_YEAR ** (months / 12);

export interface RunState {
	months: number;
	width: number;
	depth: number;
	output: number;
	sustain: number;
	costPerPr: number;
	tier: number;
	limitedBy: string[];
	pricePerMtok: number;
	costPerSession: number;
	sessionsPerPr: number;
	progress: number;
}

const sessionsPerPrAt = (months: number) =>
	Math.max(1.6, 4 - (2 * months) / RUN_MONTHS);

export function runStateAt(months: number): RunState {
	const width = ramped(START.width, months);
	const depth = ramped(START.depth, months);
	const output = ramped(START.output, months);
	const sustain = Math.min(26, 12 + (10 * months) / RUN_MONTHS);

	const price = pricePerMtok(months);
	const sessionsPerPr = sessionsPerPrAt(months);
	const costPerPr = ((sessionsPerPr * depth) / 1_000_000) * price;

	const tiers = {
		Width: floorTier(width, FLOORS.width),
		Depth: floorTier(depth, FLOORS.depth),
		Output: floorTier(output, FLOORS.output),
		Sustain: floorTier(sustain, FLOORS.sustain),
		Cost: Math.max(1, costTier(costPerPr)),
	};
	const tier = Math.min(...Object.values(tiers));

	return {
		months,
		width,
		depth,
		output,
		sustain,
		costPerPr,
		tier,
		limitedBy: Object.entries(tiers)
			.filter(([, value]) => value === tier)
			.map(([axis]) => axis),
		pricePerMtok: price,
		costPerSession: (depth / 1_000_000) * price,
		sessionsPerPr,
		progress: tierProgress(
			{ width, depth, output, sustain, cost: costPerPr },
			tier as Tier,
		),
	};
}

export function monthLabel(months: number): string {
	const date = new Date(Date.UTC(2026, 7, 1));
	date.setUTCMonth(date.getUTCMonth() + Math.round(months));
	return formatDate(date, {
		month: "short",
		year: "numeric",
		timeZone: "UTC",
	});
}

export interface RunTarget {
	axis: string;
	value: string;
	note: string;
}

export type RunStatus = "upcoming" | "active" | "complete";

export interface RunReward {
	kind: "badge" | "goods" | "surprise";
	title: string;
	detail: string;
}

export interface ProductionRun {
	id: string;
	targets: RunTarget[];
	number: number;
	label: string;
	title: string;
	goal: string;
	startsOn: string;
	endsOn: string;
	window: string;
	blurb: string;
	rewards: RunReward[];
}

export const RUNS: ProductionRun[] = [
	{
		id: "run-01",
		number: 1,
		label: "Run 01",
		title: "Everybody to Operator",
		goal: "Two agents at once, something merging every week.",
		startsOn: "2026-09-01",
		endsOn: "2026-09-30",
		window: "1 to 30 September 2026",
		blurb:
			"The smallest tier by the numbers and the hardest by everything else, because it is the only rung where you give up something you are currently good at.",
		targets: [
			{
				axis: "Width",
				value: "2 agents at once",
				note: "Not ten. Often enough that it is your median, not your best afternoon.",
			},
			{
				axis: "Depth",
				value: "2.5M tokens per session",
				note: "Give a session a whole task instead of a question.",
			},
			{
				axis: "Output",
				value: "1 merged agent PR a week",
				note: "Four in the month. The work has to land.",
			},
			{
				axis: "Sustain",
				value: "10 active days",
				note: "A third of the month.",
			},
			{
				axis: "Cost",
				value: "≤ $9 per merged PR",
				note: "Falls out of the rest, at about three and a half sessions per landed PR.",
			},
		],
		rewards: [
			{
				kind: "badge",
				title: "Run 01 badge",
				detail:
					"Permanent on your profile and beside your name on the board. Dated, numbered, and only ever awarded once. Later runs mint their own.",
			},
			{
				kind: "goods",
				title: "Factory tee",
				detail:
					"Everyone who clears Operator inside the window gets one, shipped anywhere we can post to.",
			},
			{
				kind: "surprise",
				title: "One more thing",
				detail:
					"There is a third thing for everyone who finishes. We are not saying what it is until October.",
			},
		],
	},
];

export function runStatus(run: ProductionRun, now: Date): RunStatus {
	const today = now.toISOString().slice(0, 10);
	if (today < run.startsOn) return "upcoming";
	return today > run.endsOn ? "complete" : "active";
}

export function runStatusLabel(status: RunStatus, run: ProductionRun): string {
	if (status === "active") {
		return i18n._(
			msg({
				message: "happening now",
			}),
		);
	}
	if (status === "complete") {
		return i18n._(
			msg({
				message: "complete",
			}),
		);
	}
	return i18n._({
		...msg({
			message: "starts {date}",
		}),
		values: {
			date: formatDate(new Date(`${run.startsOn}T00:00:00Z`), {
				month: "long",
				day: "numeric",
				timeZone: "UTC",
			}),
		},
	});
}
