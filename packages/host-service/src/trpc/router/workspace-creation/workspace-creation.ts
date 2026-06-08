import { router } from "../../index";
import {
	adopt,
	listProjectWorktrees,
	searchBranches,
	searchGitHubIssues,
	searchPullRequests,
} from "./procedures";
import { getTrellisStatus } from "./trellis";

export const workspaceCreationRouter = router({
	searchBranches,
	adopt,
	getTrellisStatus,
	listProjectWorktrees,
	searchGitHubIssues,
	searchPullRequests,
});
