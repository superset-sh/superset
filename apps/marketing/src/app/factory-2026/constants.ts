export type GateStatus = "open" | "partial" | "closed";

export interface FactoryGate {
	/** Set when the gate is tracked on the scorecard; enables status + jump links. */
	id?: string;
	text: string;
}

export interface FactoryLevel {
	id: string;
	name: string;
	era: string;
	description: string;
	gates: FactoryGate[];
	badge?: string;
}

export interface ForecastPeriod {
	period: string;
	title: string;
	status: "happened" | "underway" | "forecast";
	paragraphs: string[];
	becomesTrue: string;
}

export interface GateScore {
	gateId: string;
	level: string;
	gate: string;
	status: GateStatus;
	note: string;
}

export const FACTORY_LEVELS: FactoryLevel[] = [
	{
		id: "F0",
		name: "Manual",
		era: "Most of software history",
		description:
			"Humans write every line. Tools compile, lint, and complain. The keyboard is the factory.",
		gates: [{ text: "None. This is the floor." }],
	},
	{
		id: "F1",
		name: "Assisted",
		era: "2021 to 2023",
		description:
			"Autocomplete gets good. A model suggests the next few tokens, but nothing ships without a human typing most of it.",
		gates: [
			{ text: "Model-suggested code appears in a majority of new files." },
			{ text: "Nobody reviews differently because of it." },
		],
	},
	{
		id: "F2",
		name: "Supervised",
		era: "2024",
		description:
			"An agent writes whole functions and files while a human watches every step and approves every command. One agent, one human. Faster, but still serial.",
		gates: [
			{ text: "An agent completes multi-file changes end to end." },
			{ text: "The human reads every line before it merges." },
			{ text: "One human drives at most one agent at a time." },
		],
	},
	{
		id: "F3",
		name: "Delegated",
		era: "2025 to now",
		badge: "Where serious teams are",
		description:
			"The agent owns a task from ticket to diff. The human reviews the result, not the keystrokes. Attention shifts from writing code to specifying work and judging it. One engineer runs several agents at once in isolated workspaces.",
		gates: [
			{
				id: "f3-routine",
				text: "Agents complete routine tickets with no mid-task intervention.",
			},
			{
				id: "f3-parallel",
				text: "One engineer sustains 3 or more agent workstreams through a workday.",
			},
			{
				id: "f3-zero-edit",
				text: "The majority of merged agent PRs need review only, with zero human edits.",
			},
		],
	},
	{
		id: "F4",
		name: "Orchestrated",
		era: "The 2026 bet",
		badge: "The factory",
		description:
			"Fleets of agents plan, implement, review, and test each other's work. Humans set direction, arbitrate exceptions, and own taste. The unit of human attention is no longer the pull request. It is the decision.",
		gates: [
			{
				id: "f4-majority",
				text: "More than half of merged changes are written by agents with zero human edits.",
			},
			{
				id: "f4-review",
				text: "Agent review catches regressions at parity with human review on the same diffs.",
			},
			{
				id: "f4-parallel",
				text: "One engineer sustains 10 or more concurrent workstreams without dropped state.",
			},
			{
				id: "f4-overnight",
				text: "Overnight and weekend runs complete unattended and are mergeable in the morning.",
			},
			{
				id: "f4-latency",
				text: "Median ticket-to-production time under one day for routine work.",
			},
		],
	},
	{
		id: "F5",
		name: "Autonomous",
		era: "Not a 2026 claim",
		badge: "Full self-driving",
		description:
			"Outcome in, software out. Humans specify intent, constraints, and budget. The factory schedules itself, ships continuously, monitors what it shipped, and rolls itself back. Most changes merge with no human in the loop, and the incident rate does not rise.",
		gates: [
			{
				text: "A majority of production changes merge without any human reading the diff.",
			},
			{
				text: "Change-failure rate at or below the human-era baseline for two consecutive quarters.",
			},
			{
				text: "The factory reverts its own bad deploys faster than a human on-call did.",
			},
			{
				text: "Humans in the loop are there for judgment calls, not throughput.",
			},
		],
	},
];

export const FORECAST_PERIODS: ForecastPeriod[] = [
	{
		period: "Early 2026",
		title: "Review becomes the bottleneck",
		status: "happened",
		paragraphs: [
			"Writing code is no longer where engineer hours go. Reading it is. Teams that adopted parallel agents in 2025 hit the wall first: ten agents can produce more diffs before lunch than a team can honestly review by Friday.",
			"The response: agents review agents, and humans sample instead of reading everything. Trust is earned statistically, not per diff.",
		],
		becomesTrue:
			"Agent reviewers catch planted regressions at parity with median human reviewers in blind tests.",
	},
	{
		period: "Mid 2026",
		title: "The dispatcher appears",
		status: "underway",
		paragraphs: [
			"The job description shifts. Engineers stop being typists with taste and become dispatchers with taste: decomposing work, routing it to fleets, arbitrating conflicts between agents that both touched the same module.",
			"Tools that treat agents as a fleet, not a chat window, become the default interface to the codebase.",
		],
		becomesTrue:
			"One engineer sustains 10 or more concurrent workstreams, and merge-conflict resolution between agent branches is itself mostly automated.",
	},
	{
		period: "Late 2026",
		title: "The overnight shift",
		status: "forecast",
		paragraphs: [
			"Long-horizon reliability crosses a threshold. Work assigned at 6pm is mergeable at 9am often enough that not scheduling the overnight shift feels like leaving a factory idle.",
			"Environment setup, flaky tests, and credential plumbing, the boring failure modes that killed unattended runs in 2025, are mostly engineered away rather than modeled away.",
		],
		becomesTrue:
			"Unattended runs of 8 hours or more succeed on a majority of routine tickets without a human unblocking them.",
	},
	{
		period: "2027",
		title: "The first F4 teams",
		status: "forecast",
		paragraphs: [
			"The first teams, small ones, ship majority-agent code without reading every line, and their defect rates hold. Nothing mystical behind it: review layers, canaries, fast rollback, and a habit of writing specifications instead of code.",
			"Everyone argues about whether this generalizes. That argument is the sign the level was reached.",
		],
		becomesTrue:
			"At least one team we can name, ours included, passes every F4 gate for a full quarter and publishes the numbers.",
	},
];

export const GATE_SCORECARD: GateScore[] = [
	{
		gateId: "f3-routine",
		level: "F3",
		gate: "Routine tickets with no mid-task intervention",
		status: "open",
		note: "Standard for well-scoped work in isolated workspaces.",
	},
	{
		gateId: "f3-parallel",
		level: "F3",
		gate: "3+ concurrent workstreams per engineer",
		status: "open",
		note: "Daily practice for our team and our heaviest users.",
	},
	{
		gateId: "f3-zero-edit",
		level: "F3",
		gate: "Zero-edit majority on merged agent PRs",
		status: "partial",
		note: "True for routine work, not yet for gnarly refactors.",
	},
	{
		gateId: "f4-majority",
		level: "F4",
		gate: "Half of merged changes are zero-edit agent code",
		status: "closed",
		note: "Humans still edit or heavily steer most merged diffs.",
	},
	{
		gateId: "f4-review",
		level: "F4",
		gate: "Agent review at parity with human review",
		status: "closed",
		note: "Agent review catches real bugs but is not yet trusted alone.",
	},
	{
		gateId: "f4-parallel",
		level: "F4",
		gate: "10+ concurrent workstreams without dropped state",
		status: "partial",
		note: "Possible on good days. Supervision cost still grows too fast.",
	},
	{
		gateId: "f4-overnight",
		level: "F4",
		gate: "Unattended overnight runs, mergeable by morning",
		status: "partial",
		note: "Works when environments are clean. Environments are rarely clean.",
	},
	{
		gateId: "f4-latency",
		level: "F4",
		gate: "Ticket to production under one day, median",
		status: "closed",
		note: "Review and CI queues eat the gains agents create.",
	},
];

export const GATE_STATUS_BY_ID: Record<string, GateStatus> = Object.fromEntries(
	GATE_SCORECARD.map((score) => [score.gateId, score.status]),
);

export const GATE_GLYPHS: Record<GateStatus, string> = {
	open: "●",
	partial: "◐",
	closed: "○",
};

export interface GateTally {
	score: number;
	total: number;
}

/** Open counts 1, partial counts 0.5. */
export function tallyGates(level: string): GateTally {
	const scores = GATE_SCORECARD.filter((score) => score.level === level);
	const score = scores.reduce(
		(sum, entry) =>
			sum +
			(entry.status === "open" ? 1 : entry.status === "partial" ? 0.5 : 0),
		0,
	);
	return { score, total: scores.length };
}

export const formatTally = (tally: GateTally) =>
	`${tally.score % 1 === 0 ? tally.score : tally.score.toFixed(1)}/${tally.total}`;

export interface AttentionPoint {
	level: string;
	share: number;
}

/** Human share of the effort behind a merged change, schematic. */
export const ATTENTION_CURVE: AttentionPoint[] = [
	{ level: "F0", share: 100 },
	{ level: "F1", share: 90 },
	{ level: "F2", share: 70 },
	{ level: "F3", share: 35 },
	{ level: "F4", share: 10 },
	{ level: "F5", share: 2 },
];

export interface AgentSharePoint {
	t: number;
	label: string;
	share: number;
	forecast: boolean;
}

/** Share of merged changes written by agents with zero human edits, our estimate. */
export const AGENT_SHARE_SERIES: AgentSharePoint[] = [
	{ t: 2024.0, label: "Early 2024", share: 1, forecast: false },
	{ t: 2024.5, label: "Mid 2024", share: 2, forecast: false },
	{ t: 2025.0, label: "Early 2025", share: 5, forecast: false },
	{ t: 2025.5, label: "Mid 2025", share: 9, forecast: false },
	{ t: 2026.0, label: "Early 2026", share: 16, forecast: false },
	{ t: 2026.6, label: "Aug 2026", share: 27, forecast: false },
	{ t: 2027.0, label: "Early 2027", share: 38, forecast: true },
	{ t: 2027.5, label: "Mid 2027", share: 47, forecast: true },
	{ t: 2028.0, label: "Early 2028", share: 56, forecast: true },
];

export const F4_GATE_SHARE = 50;
export const TODAY_T = 2026.6;
export const TIMELINE_START = 2024;
export const TIMELINE_END = 2028;

export const PERIOD_IDS: Record<string, string> = {
	"Early 2026": "early-2026",
	"Mid 2026": "mid-2026",
	"Late 2026": "late-2026",
	"2027": "first-f4-teams",
};

/** Where each forecast period sits on the 2024 to 2028 timeline. */
export const PERIOD_T: Record<string, number> = {
	"early-2026": 2026.1,
	"mid-2026": 2026.5,
	"late-2026": 2026.85,
	"first-f4-teams": 2027.3,
};
