import {
	FACTORY_STAGES,
	type FactoryBoardKind,
	type FactoryStage,
	type FactoryWorkItem,
} from "../types";

const STAGE_LABELS: Record<FactoryStage, string> = {
	intake: "Intake",
	triage: "Triage",
	planning: "Planning",
	execute: "Building",
	review: "Review",
	done: "Done",
};

const NEXT_STAGE: Partial<Record<FactoryStage, FactoryStage>> = {
	intake: "triage",
	triage: "planning",
	planning: "execute",
	execute: "review",
	review: "done",
};

export function getFactoryStage(item: FactoryWorkItem): FactoryStage {
	const stage = item.stages.findLast((candidate) =>
		FACTORY_STAGES.includes(candidate as FactoryStage),
	);
	return (stage as FactoryStage | undefined) ?? "intake";
}

export function getFactoryStageLabel(stage: FactoryStage): string {
	return STAGE_LABELS[stage];
}

export function getNextFactoryStage(
	stage: FactoryStage,
): FactoryStage | undefined {
	return NEXT_STAGE[stage];
}

export function belongsToFactoryBoard(
	item: FactoryWorkItem,
	board: FactoryBoardKind,
): boolean {
	return (item.metadata.board ?? "work") === board;
}

export function applyDemoTransition(
	item: FactoryWorkItem,
	destinationStage: FactoryStage,
): FactoryWorkItem {
	const now = new Date().toISOString();
	const previousHistory = item.stageHistory.map((entry, index, history) =>
		index === history.length - 1 && !entry.exitedAt
			? { ...entry, exitedAt: now }
			: entry,
	);
	const decision =
		destinationStage === "execute"
			? "Open workspace"
			: destinationStage === "review"
				? "Review pull request"
				: destinationStage === "done"
					? "Shipped"
					: item.metadata.decision;
	return {
		...item,
		stages: [...item.stages, destinationStage],
		stageHistory: [
			...previousHistory,
			{
				stage: destinationStage,
				enteredAt: now,
				by: "Roshvan",
			},
		],
		metadata: {
			...item.metadata,
			agent: destinationStage === "execute" ? "builder" : item.metadata.agent,
			decision,
			workspaceId:
				destinationStage === "execute"
					? (item.metadata.workspaceId ?? `workspace-${item.id}`)
					: item.metadata.workspaceId,
		},
		revision: item.revision + 1,
		updatedAt: now,
	};
}
