/**
 * Minimal structural view of the tRPC `useUtils()` surface that the Changes
 * tab needs in order to refresh. Declared structurally so the real
 * `workspaceTrpc.useUtils()` result is assignable and tests can pass a mock.
 */
export interface ChangesRefreshUtils {
	git: {
		getStatus: ChangesRefreshInvalidator;
		getDiff: ChangesRefreshInvalidator;
		listCommits: ChangesRefreshInvalidator;
		listBranches: ChangesRefreshInvalidator;
		getBaseBranch: ChangesRefreshInvalidator;
		getPullRequest: ChangesRefreshInvalidator;
		getBranchSyncStatus: ChangesRefreshInvalidator;
	};
}

interface ChangesRefreshInvalidator {
	invalidate: (input: { workspaceId: string }) => Promise<void>;
}

/**
 * Invalidate every query that backs the Changes tab for a workspace so a manual
 * "Refresh changes" click pulls fresh data immediately.
 *
 * This includes the pull-request and branch-sync queries that drive the PR
 * Helper, so the helper updates on demand instead of waiting for its polling
 * interval (see GitHub #5181).
 */
export async function refreshChangesTab(
	utils: ChangesRefreshUtils,
	workspaceId: string,
): Promise<void> {
	await Promise.all([
		utils.git.getStatus.invalidate({ workspaceId }),
		utils.git.getDiff.invalidate({ workspaceId }),
		utils.git.listCommits.invalidate({ workspaceId }),
		utils.git.listBranches.invalidate({ workspaceId }),
		utils.git.getBaseBranch.invalidate({ workspaceId }),
		utils.git.getPullRequest.invalidate({ workspaceId }),
		utils.git.getBranchSyncStatus.invalidate({ workspaceId }),
	]);
}
