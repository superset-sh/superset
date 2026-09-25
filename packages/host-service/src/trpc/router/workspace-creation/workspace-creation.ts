import { router } from "../../index";
import {
	adopt,
	getRepoContributors,
	listProjectWorktrees,
	searchBranches,
	searchGitHubIssues,
	searchPullRequests,
	searchRemoteBranches,
} from "./procedures";

export const workspaceCreationRouter = router({
	searchBranches,
	adopt,
	getRepoContributors,
	listProjectWorktrees,
	searchGitHubIssues,
	searchPullRequests,
	searchRemoteBranches,
});
