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
import { getIssueSearchCapabilities } from "./procedures/get-issue-search-capabilities";
import { getPullRequestSearchCapabilities } from "./procedures/get-pull-request-search-capabilities";

export const workspaceCreationRouter = router({
	getPullRequestSearchCapabilities,
	getIssueSearchCapabilities,
	searchBranches,
	adopt,
	getRepoContributors,
	listProjectWorktrees,
	searchGitHubIssues,
	searchPullRequests,
	searchRemoteBranches,
});
