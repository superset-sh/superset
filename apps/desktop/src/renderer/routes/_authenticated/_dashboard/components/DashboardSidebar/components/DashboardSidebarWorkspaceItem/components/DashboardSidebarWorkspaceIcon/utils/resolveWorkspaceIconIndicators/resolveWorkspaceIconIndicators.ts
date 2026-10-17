import type { ActivePaneStatus } from "shared/tabs-types";

interface ResolveWorkspaceIconIndicatorsInput {
	isCreatePending: boolean;
	workspaceStatus: ActivePaneStatus | null;
	hasPullRequest: boolean;
}

interface WorkspaceIconIndicators {
	showSpinner: boolean;
	overlayStatus: ActivePaneStatus | null;
}

export function resolveWorkspaceIconIndicators({
	isCreatePending,
	workspaceStatus,
	hasPullRequest,
}: ResolveWorkspaceIconIndicatorsInput): WorkspaceIconIndicators {
	const isWorking = workspaceStatus === "working";
	const showSpinner = isCreatePending || (isWorking && !hasPullRequest);
	return {
		showSpinner,
		overlayStatus: showSpinner && isWorking ? null : workspaceStatus,
	};
}
