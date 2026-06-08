import { describe, expect, it, mock } from "bun:test";
import {
	type ChangesRefreshUtils,
	refreshChangesTab,
} from "./refreshChangesTab";

function createMockUtils() {
	const invalidate = () =>
		mock((_input: { workspaceId: string }) => Promise.resolve());
	const utils = {
		git: {
			getStatus: { invalidate: invalidate() },
			getDiff: { invalidate: invalidate() },
			listCommits: { invalidate: invalidate() },
			listBranches: { invalidate: invalidate() },
			getBaseBranch: { invalidate: invalidate() },
			getPullRequest: { invalidate: invalidate() },
			getBranchSyncStatus: { invalidate: invalidate() },
		},
	};
	return utils satisfies ChangesRefreshUtils;
}

describe("refreshChangesTab", () => {
	const workspaceId = "ws-123";

	it("invalidates the core git queries that back the Changes tab", async () => {
		const utils = createMockUtils();
		await refreshChangesTab(utils, workspaceId);

		for (const query of [
			utils.git.getStatus,
			utils.git.getDiff,
			utils.git.listCommits,
			utils.git.listBranches,
			utils.git.getBaseBranch,
		]) {
			expect(query.invalidate).toHaveBeenCalledWith({ workspaceId });
		}
	});

	// Reproduces GitHub #5181: clicking "Refresh changes" must also refresh the
	// queries that drive the PR Helper, otherwise the helper only updates on its
	// 10s polling interval and the manual refresh appears to do nothing for PRs.
	it("invalidates the pull-request query so the PR Helper updates immediately", async () => {
		const utils = createMockUtils();
		await refreshChangesTab(utils, workspaceId);

		expect(utils.git.getPullRequest.invalidate).toHaveBeenCalledWith({
			workspaceId,
		});
	});

	it("invalidates the branch-sync query that the PR Helper depends on", async () => {
		const utils = createMockUtils();
		await refreshChangesTab(utils, workspaceId);

		expect(utils.git.getBranchSyncStatus.invalidate).toHaveBeenCalledWith({
			workspaceId,
		});
	});
});
