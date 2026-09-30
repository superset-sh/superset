import { router } from "../../index";
import {
	adopt,
	getRepoContributors,
	listProjectWorktrees,
	searchBranches,
	searchGitHubIssues,
	searchGitLabIssues,
	searchGitLabMergeRequests,
	searchPullRequests,
	searchRemoteBranches,
} from "./procedures";

export const workspaceCreationRouter = router({
	searchBranches,
	adopt,
	getRepoContributors,
	listProjectWorktrees,
	searchGitHubIssues,
	searchGitLabIssues,
	searchGitLabMergeRequests,
	searchPullRequests,
	searchRemoteBranches,
});
