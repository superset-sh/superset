import type { RouterOutputs } from "@superset/trpc";

export type FactoryRow = RouterOutputs["factory"]["list"][number];
export type FactoryItem =
	RouterOutputs["factory"]["listItems"]["items"][number];
export type FactoryLatestRun =
	RouterOutputs["factory"]["listItems"]["latestRuns"][number];
export type FactoryRun = RouterOutputs["factory"]["getItem"]["runs"][number];

export type FactoryStage = FactoryItem["stage"];

/** Board column order. */
export const BOARD_STAGES = [
	"intake",
	"classify",
	"analyze",
	"implement",
	"review",
	"human_review",
	"verify",
	"done",
	"rejected",
] as const satisfies readonly FactoryStage[];

export const STAGE_LABELS: Record<FactoryStage, string> = {
	intake: "Intake",
	classify: "Classify",
	analyze: "Analyze",
	implement: "Implement",
	review: "Review",
	human_review: "Human review",
	verify: "Verify",
	done: "Done",
	rejected: "Rejected",
};

/** Agent-executed stages, for the stage settings UI. */
export const AGENT_STAGES_UI = [
	"classify",
	"analyze",
	"implement",
	"review",
	"verify",
] as const satisfies readonly FactoryStage[];
export type AgentStageUI = (typeof AGENT_STAGES_UI)[number];

/** Stages a Run button may dispatch from (agent stages + intake's advance). */
export const DISPATCHABLE_STAGES: ReadonlySet<FactoryStage> = new Set([
	"intake",
	"classify",
	"analyze",
	"implement",
	"review",
	"verify",
]);
