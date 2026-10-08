import type { BranchSyncStatus, PRFlowState } from "../getPRFlowState";

interface GetShipMenuActionsInput {
	flowState: PRFlowState;
	sync: BranchSyncStatus | null;
	workspaceCanCreatePr: boolean;
	commitsLoaded: boolean;
}

export interface ShipMenuActions {
	canCommit: boolean;
	canPush: boolean;
	canCreatePr: boolean;
}

export function getShipMenuActions({
	flowState,
	sync,
	workspaceCanCreatePr,
	commitsLoaded,
}: GetShipMenuActionsInput): ShipMenuActions {
	const flowSync =
		flowState.kind === "no-pr" || flowState.kind === "pr-exists"
			? flowState.sync
			: null;
	return {
		canCommit: !!sync?.hasUncommitted && !sync.isDetached,
		canPush:
			flowSync != null && (!flowSync.hasUpstream || flowSync.pushCount > 0),
		canCreatePr:
			flowState.kind === "no-pr" &&
			!flowState.sync.hasUncommitted &&
			commitsLoaded &&
			workspaceCanCreatePr,
	};
}
