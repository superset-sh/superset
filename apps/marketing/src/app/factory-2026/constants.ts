import type { MessageDescriptor } from "@lingui/core";
import { msg } from "@lingui/core/macro";

export type GateStatus = "open" | "partial" | "closed";

export interface FactoryGate {
	/** Set when the gate is tracked on the scorecard; enables status + jump links. */
	id?: string;
	text: MessageDescriptor;
}

export interface FactoryLevel {
	id: string;
	name: MessageDescriptor;
	era: MessageDescriptor;
	description: MessageDescriptor;
	gates: FactoryGate[];
	badge?: MessageDescriptor;
}

export interface ForecastPeriod {
	/** Anchor id used for deep links and the sidebar timeline. */
	id: string;
	period: MessageDescriptor;
	title: MessageDescriptor;
	status: "happened" | "underway" | "forecast";
	paragraphs: MessageDescriptor[];
	becomesTrue: MessageDescriptor;
}

export interface GateScore {
	gateId: string;
	level: string;
	gate: MessageDescriptor;
	status: GateStatus;
	note: MessageDescriptor;
}

export const GATE_STATUS_LABELS: Record<GateStatus, MessageDescriptor> = {
	open: msg({ id: "marketing.factory.status.open", message: "Open" }),
	partial: msg({ id: "marketing.factory.status.partial", message: "Partial" }),
	closed: msg({ id: "marketing.factory.status.closed", message: "Closed" }),
};

export const FORECAST_STATUS_LABELS: Record<
	ForecastPeriod["status"],
	MessageDescriptor
> = {
	happened: msg({
		id: "marketing.factory.forecastStatus.happened",
		message: "Happened",
	}),
	underway: msg({
		id: "marketing.factory.forecastStatus.underway",
		message: "Underway",
	}),
	forecast: msg({
		id: "marketing.factory.forecastStatus.forecast",
		message: "Forecast",
	}),
};

export const FACTORY_LEVELS: FactoryLevel[] = [
	{
		id: "F0",
		name: msg({ id: "marketing.factory.level.f0.name", message: "Manual" }),
		era: msg({
			id: "marketing.factory.level.f0.era",
			message: "Most of software history",
		}),
		description: msg({
			id: "marketing.factory.level.f0.description",
			message:
				"Humans write every line. Tools compile, lint, and complain. The keyboard is the factory.",
		}),
		gates: [
			{
				text: msg({
					id: "marketing.factory.level.f0.gate1",
					message: "None. This is the floor.",
				}),
			},
		],
	},
	{
		id: "F1",
		name: msg({ id: "marketing.factory.level.f1.name", message: "Assisted" }),
		era: msg({ id: "marketing.factory.level.f1.era", message: "2021 to 2023" }),
		description: msg({
			id: "marketing.factory.level.f1.description",
			message:
				"Autocomplete gets good. A model suggests the next few tokens, but nothing ships without a human typing most of it.",
		}),
		gates: [
			{
				text: msg({
					id: "marketing.factory.level.f1.gate1",
					message: "Model-suggested code appears in a majority of new files.",
				}),
			},
			{
				text: msg({
					id: "marketing.factory.level.f1.gate2",
					message: "Nobody reviews differently because of it.",
				}),
			},
		],
	},
	{
		id: "F2",
		name: msg({ id: "marketing.factory.level.f2.name", message: "Supervised" }),
		era: msg({ id: "marketing.factory.level.f2.era", message: "2024" }),
		description: msg({
			id: "marketing.factory.level.f2.description",
			message:
				"An agent writes whole functions and files while a human watches every step and approves every command. One agent, one human. Faster, but still serial.",
		}),
		gates: [
			{
				text: msg({
					id: "marketing.factory.level.f2.gate1",
					message: "An agent completes multi-file changes end to end.",
				}),
			},
			{
				text: msg({
					id: "marketing.factory.level.f2.gate2",
					message: "The human reads every line before it merges.",
				}),
			},
			{
				text: msg({
					id: "marketing.factory.level.f2.gate3",
					message: "One human drives at most one agent at a time.",
				}),
			},
		],
	},
	{
		id: "F3",
		name: msg({ id: "marketing.factory.level.f3.name", message: "Delegated" }),
		era: msg({ id: "marketing.factory.level.f3.era", message: "2025 to now" }),
		badge: msg({
			id: "marketing.factory.level.f3.badge",
			message: "Where serious teams are",
		}),
		description: msg({
			id: "marketing.factory.level.f3.description",
			message:
				"The agent owns a task from ticket to diff. The human reviews the result, not the keystrokes. Attention shifts from writing code to specifying work and judging it. One engineer runs several agents at once in isolated workspaces.",
		}),
		gates: [
			{
				id: "f3-routine",
				text: msg({
					id: "marketing.factory.level.f3.gate.routine",
					message:
						"Agents complete routine tickets with no mid-task intervention.",
				}),
			},
			{
				id: "f3-parallel",
				text: msg({
					id: "marketing.factory.level.f3.gate.parallel",
					message:
						"One engineer sustains 3 or more agent workstreams through a workday.",
				}),
			},
			{
				id: "f3-zero-edit",
				text: msg({
					id: "marketing.factory.level.f3.gate.zeroEdit",
					message:
						"The majority of merged agent PRs need review only, with zero human edits.",
				}),
			},
		],
	},
	{
		id: "F4",
		name: msg({
			id: "marketing.factory.level.f4.name",
			message: "Orchestrated",
		}),
		era: msg({ id: "marketing.factory.level.f4.era", message: "The 2026 bet" }),
		badge: msg({
			id: "marketing.factory.level.f4.badge",
			message: "The factory",
		}),
		description: msg({
			id: "marketing.factory.level.f4.description",
			message:
				"Fleets of agents plan, implement, review, and test each other's work. Humans set direction, arbitrate exceptions, and own taste. The unit of human attention is no longer the pull request. It is the decision.",
		}),
		gates: [
			{
				id: "f4-majority",
				text: msg({
					id: "marketing.factory.level.f4.gate.majority",
					message:
						"More than half of merged changes are written by agents with zero human edits.",
				}),
			},
			{
				id: "f4-review",
				text: msg({
					id: "marketing.factory.level.f4.gate.review",
					message:
						"Agent review catches regressions at parity with human review on the same diffs.",
				}),
			},
			{
				id: "f4-parallel",
				text: msg({
					id: "marketing.factory.level.f4.gate.parallel",
					message:
						"One engineer sustains 10 or more concurrent workstreams without dropped state.",
				}),
			},
			{
				id: "f4-overnight",
				text: msg({
					id: "marketing.factory.level.f4.gate.overnight",
					message:
						"Overnight and weekend runs complete unattended and are mergeable in the morning.",
				}),
			},
			{
				id: "f4-latency",
				text: msg({
					id: "marketing.factory.level.f4.gate.latency",
					message:
						"Median ticket-to-production time under one day for routine work.",
				}),
			},
		],
	},
	{
		id: "F5",
		name: msg({ id: "marketing.factory.level.f5.name", message: "Autonomous" }),
		era: msg({
			id: "marketing.factory.level.f5.era",
			message: "Not a 2026 claim",
		}),
		badge: msg({
			id: "marketing.factory.level.f5.badge",
			message: "Full self-driving",
		}),
		description: msg({
			id: "marketing.factory.level.f5.description",
			message:
				"Outcome in, software out. Humans specify intent, constraints, and budget. The factory schedules itself, ships continuously, monitors what it shipped, and rolls itself back. Most changes merge with no human in the loop, and the incident rate does not rise.",
		}),
		gates: [
			{
				text: msg({
					id: "marketing.factory.level.f5.gate1",
					message:
						"A majority of production changes merge without any human reading the diff.",
				}),
			},
			{
				text: msg({
					id: "marketing.factory.level.f5.gate2",
					message:
						"Change-failure rate at or below the human-era baseline for two consecutive quarters.",
				}),
			},
			{
				text: msg({
					id: "marketing.factory.level.f5.gate3",
					message:
						"The factory reverts its own bad deploys faster than a human on-call did.",
				}),
			},
			{
				text: msg({
					id: "marketing.factory.level.f5.gate4",
					message:
						"Humans in the loop are there for judgment calls, not throughput.",
				}),
			},
		],
	},
];

export const FORECAST_PERIODS: ForecastPeriod[] = [
	{
		id: "early-2026",
		period: msg({
			id: "marketing.factory.forecast.early2026.period",
			message: "Early 2026",
		}),
		title: msg({
			id: "marketing.factory.forecast.early2026.title",
			message: "Review becomes the bottleneck",
		}),
		status: "happened",
		paragraphs: [
			msg({
				id: "marketing.factory.forecast.early2026.p1",
				message:
					"Writing code is no longer where engineer hours go. Reading it is. Teams that adopted parallel agents in 2025 hit the wall first: ten agents can produce more diffs before lunch than a team can honestly review by Friday.",
			}),
			msg({
				id: "marketing.factory.forecast.early2026.p2",
				message:
					"The response: agents review agents, and humans sample instead of reading everything. Trust is earned statistically, not per diff.",
			}),
		],
		becomesTrue: msg({
			id: "marketing.factory.forecast.early2026.becomesTrue",
			message:
				"Agent reviewers catch planted regressions at parity with median human reviewers in blind tests.",
		}),
	},
	{
		id: "mid-2026",
		period: msg({
			id: "marketing.factory.forecast.mid2026.period",
			message: "Mid 2026",
		}),
		title: msg({
			id: "marketing.factory.forecast.mid2026.title",
			message: "The dispatcher appears",
		}),
		status: "underway",
		paragraphs: [
			msg({
				id: "marketing.factory.forecast.mid2026.p1",
				message:
					"The job description shifts. Engineers stop being typists with taste and become dispatchers with taste: decomposing work, routing it to fleets, arbitrating conflicts between agents that both touched the same module.",
			}),
			msg({
				id: "marketing.factory.forecast.mid2026.p2",
				message:
					"Tools that treat agents as a fleet, not a chat window, become the default interface to the codebase.",
			}),
		],
		becomesTrue: msg({
			id: "marketing.factory.forecast.mid2026.becomesTrue",
			message:
				"One engineer sustains 10 or more concurrent workstreams, and merge-conflict resolution between agent branches is itself mostly automated.",
		}),
	},
	{
		id: "late-2026",
		period: msg({
			id: "marketing.factory.forecast.late2026.period",
			message: "Late 2026",
		}),
		title: msg({
			id: "marketing.factory.forecast.late2026.title",
			message: "The overnight shift",
		}),
		status: "forecast",
		paragraphs: [
			msg({
				id: "marketing.factory.forecast.late2026.p1",
				message:
					"Long-horizon reliability crosses a threshold. Work assigned at 6pm is mergeable at 9am often enough that not scheduling the overnight shift feels like leaving a factory idle.",
			}),
			msg({
				id: "marketing.factory.forecast.late2026.p2",
				message:
					"Environment setup, flaky tests, and credential plumbing, the boring failure modes that killed unattended runs in 2025, are mostly engineered away rather than modeled away.",
			}),
		],
		becomesTrue: msg({
			id: "marketing.factory.forecast.late2026.becomesTrue",
			message:
				"Unattended runs of 8 hours or more succeed on a majority of routine tickets without a human unblocking them.",
		}),
	},
	{
		id: "first-f4-teams",
		period: msg({
			id: "marketing.factory.forecast.2027.period",
			message: "2027",
		}),
		title: msg({
			id: "marketing.factory.forecast.2027.title",
			message: "The first F4 teams",
		}),
		status: "forecast",
		paragraphs: [
			msg({
				id: "marketing.factory.forecast.2027.p1",
				message:
					"The first teams, small ones, ship majority-agent code without reading every line, and their defect rates hold. Nothing mystical behind it: review layers, canaries, fast rollback, and a habit of writing specifications instead of code.",
			}),
			msg({
				id: "marketing.factory.forecast.2027.p2",
				message:
					"Everyone argues about whether this generalizes. That argument is the sign the level was reached.",
			}),
		],
		becomesTrue: msg({
			id: "marketing.factory.forecast.2027.becomesTrue",
			message:
				"At least one team we can name, ours included, passes every F4 gate for a full quarter and publishes the numbers.",
		}),
	},
];

export const GATE_SCORECARD: GateScore[] = [
	{
		gateId: "f3-routine",
		level: "F3",
		gate: msg({
			id: "marketing.factory.scorecard.f3Routine.gate",
			message: "Routine tickets with no mid-task intervention",
		}),
		status: "open",
		note: msg({
			id: "marketing.factory.scorecard.f3Routine.note",
			message: "Standard for well-scoped work in isolated workspaces.",
		}),
	},
	{
		gateId: "f3-parallel",
		level: "F3",
		gate: msg({
			id: "marketing.factory.scorecard.f3Parallel.gate",
			message: "3+ concurrent workstreams per engineer",
		}),
		status: "open",
		note: msg({
			id: "marketing.factory.scorecard.f3Parallel.note",
			message: "Daily practice for our team and our heaviest users.",
		}),
	},
	{
		gateId: "f3-zero-edit",
		level: "F3",
		gate: msg({
			id: "marketing.factory.scorecard.f3ZeroEdit.gate",
			message: "Zero-edit majority on merged agent PRs",
		}),
		status: "partial",
		note: msg({
			id: "marketing.factory.scorecard.f3ZeroEdit.note",
			message: "True for routine work, not yet for gnarly refactors.",
		}),
	},
	{
		gateId: "f4-majority",
		level: "F4",
		gate: msg({
			id: "marketing.factory.scorecard.f4Majority.gate",
			message: "Half of merged changes are zero-edit agent code",
		}),
		status: "closed",
		note: msg({
			id: "marketing.factory.scorecard.f4Majority.note",
			message: "Humans still edit or heavily steer most merged diffs.",
		}),
	},
	{
		gateId: "f4-review",
		level: "F4",
		gate: msg({
			id: "marketing.factory.scorecard.f4Review.gate",
			message: "Agent review at parity with human review",
		}),
		status: "closed",
		note: msg({
			id: "marketing.factory.scorecard.f4Review.note",
			message: "Agent review catches real bugs but is not yet trusted alone.",
		}),
	},
	{
		gateId: "f4-parallel",
		level: "F4",
		gate: msg({
			id: "marketing.factory.scorecard.f4Parallel.gate",
			message: "10+ concurrent workstreams without dropped state",
		}),
		status: "partial",
		note: msg({
			id: "marketing.factory.scorecard.f4Parallel.note",
			message: "Possible on good days. Supervision cost still grows too fast.",
		}),
	},
	{
		gateId: "f4-overnight",
		level: "F4",
		gate: msg({
			id: "marketing.factory.scorecard.f4Overnight.gate",
			message: "Unattended overnight runs, mergeable by morning",
		}),
		status: "partial",
		note: msg({
			id: "marketing.factory.scorecard.f4Overnight.note",
			message:
				"Works when environments are clean. Environments are rarely clean.",
		}),
	},
	{
		gateId: "f4-latency",
		level: "F4",
		gate: msg({
			id: "marketing.factory.scorecard.f4Latency.gate",
			message: "Ticket to production under one day, median",
		}),
		status: "closed",
		note: msg({
			id: "marketing.factory.scorecard.f4Latency.note",
			message: "Review and CI queues eat the gains agents create.",
		}),
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
	label: MessageDescriptor;
	share: number;
	forecast: boolean;
}

/** Share of merged changes written by agents with zero human edits, our estimate. */
export const AGENT_SHARE_SERIES: AgentSharePoint[] = [
	{
		t: 2024.0,
		label: msg({
			id: "marketing.factory.series.early2024",
			message: "Early 2024",
		}),
		share: 1,
		forecast: false,
	},
	{
		t: 2024.5,
		label: msg({ id: "marketing.factory.series.mid2024", message: "Mid 2024" }),
		share: 2,
		forecast: false,
	},
	{
		t: 2025.0,
		label: msg({
			id: "marketing.factory.series.early2025",
			message: "Early 2025",
		}),
		share: 5,
		forecast: false,
	},
	{
		t: 2025.5,
		label: msg({ id: "marketing.factory.series.mid2025", message: "Mid 2025" }),
		share: 9,
		forecast: false,
	},
	{
		t: 2026.0,
		label: msg({
			id: "marketing.factory.series.early2026",
			message: "Early 2026",
		}),
		share: 16,
		forecast: false,
	},
	{
		t: 2026.6,
		label: msg({ id: "marketing.factory.series.aug2026", message: "Aug 2026" }),
		share: 27,
		forecast: false,
	},
	{
		t: 2027.0,
		label: msg({
			id: "marketing.factory.series.early2027",
			message: "Early 2027",
		}),
		share: 38,
		forecast: true,
	},
	{
		t: 2027.5,
		label: msg({ id: "marketing.factory.series.mid2027", message: "Mid 2027" }),
		share: 47,
		forecast: true,
	},
	{
		t: 2028.0,
		label: msg({
			id: "marketing.factory.series.early2028",
			message: "Early 2028",
		}),
		share: 56,
		forecast: true,
	},
];

export const F4_GATE_SHARE = 50;
export const TODAY_T = 2026.6;
export const TIMELINE_START = 2024;
export const TIMELINE_END = 2028;

/** Where each forecast period sits on the 2024 to 2028 timeline. */
export const PERIOD_T: Record<string, number> = {
	"early-2026": 2026.1,
	"mid-2026": 2026.5,
	"late-2026": 2026.85,
	"first-f4-teams": 2027.3,
};
