import { router } from "../../index";
import {
	adopt,
	checkout,
	create,
	generateBranchName,
	getContext,
	getGitHubIssueContent,
	getGitHubPullRequestContent,
	getProgress,
	searchBranches,
	searchGitHubIssues,
	searchPullRequests,
} from "./procedures";

export const workspaceCreationRouter = router({
	getContext,
	searchBranches,
	generateBranchName,
	getProgress,
	create,
	checkout,
	adopt,
	searchGitHubIssues,
	searchPullRequests,
	getGitHubIssueContent,
	getGitHubPullRequestContent,
});
