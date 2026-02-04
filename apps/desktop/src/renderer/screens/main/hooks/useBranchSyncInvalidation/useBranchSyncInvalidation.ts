import { useEffect } from "react";
import { electronTrpc } from "renderer/lib/electron-trpc";

/**
 * Invalidates workspace-related caches when the git branch (from status polling)
 * diverges from the branch stored in the local DB workspace record.
 *
 * This keeps sidebar labels and hover cards in sync after external `git switch`.
 */
export function useBranchSyncInvalidation({
	gitBranch,
	workspaceBranch,
	workspaceId,
}: {
	gitBranch: string | undefined;
	workspaceBranch: string | undefined;
	workspaceId: string;
}) {
	const utils = electronTrpc.useUtils();

	useEffect(() => {
		if (!gitBranch || gitBranch === "HEAD" || !workspaceBranch) return;
		if (gitBranch !== workspaceBranch) {
			utils.workspaces.getAllGrouped.invalidate();
			utils.workspaces.get.invalidate({ id: workspaceId });
			utils.workspaces.getWorktreeInfo.invalidate({ workspaceId });
		}
	}, [gitBranch, workspaceBranch, workspaceId, utils]);
}
