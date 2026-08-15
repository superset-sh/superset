import { router } from "../../index";
import {
	adopt,
	listProjectWorktrees,
	searchBranches,
	searchGitHubIssues,
	searchPullRequests,
	searchRemoteBranches,
} from "./procedures";

export const workspaceCreationRouter = router({
	searchBranches,
	adopt,
	listProjectWorktrees,
	searchGitHubIssues,
	searchPullRequests,
	searchRemoteBranches,
});
