export const FACTORY_STAGES = [
	"intake",
	"triage",
	"planning",
	"execute",
	"review",
	"done",
] as const;

export type FactoryStage = (typeof FACTORY_STAGES)[number];
export type FactoryBoardKind = "work" | "review";
export type FactorySource =
	| "github-issue"
	| "github-pr"
	| "linear-issue"
	| "manual";

export interface FactoryProject {
	id: string;
	name: string;
	defaultModelId?: string | null;
}

export interface FactoryStageHistoryEntry {
	stage: string;
	enteredAt: string;
	exitedAt?: string;
	by: string;
}

export interface FactoryWorkItemMetadata {
	agent?: string;
	age?: string;
	board?: FactoryBoardKind;
	branch?: string;
	checks?: {
		failed: number;
		passed: number;
	};
	decision?: string;
	description?: string;
	diff?: {
		additions: number;
		deletions: number;
		files: number;
	};
	plan?: Array<{
		label: string;
		status: "complete" | "in-progress" | "pending";
	}>;
	project?: string;
	pullRequest?: number;
	workspaceId?: string;
}

export interface FactoryWorkItem {
	id: string;
	factoryProjectId: string;
	source: FactorySource;
	sourceKey: string | null;
	title: string;
	url: string | null;
	stages: string[];
	stageHistory: FactoryStageHistoryEntry[];
	metadata: FactoryWorkItemMetadata;
	revision: number;
	createdAt: string;
	updatedAt: string;
}

export interface FactoryTransitionInput {
	board: FactoryBoardKind;
	destinationStage: FactoryStage;
	item: FactoryWorkItem;
}
