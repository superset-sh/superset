import { router } from "../../index";
import {
	adopt,
	getIssue,
	listProjectWorktrees,
	searchBranches,
	searchGitHubIssues,
	searchPullRequests,
} from "./procedures";

export const workspaceCreationRouter = router({
	searchBranches,
	adopt,
	getIssue,
	listProjectWorktrees,
	searchGitHubIssues,
	searchPullRequests,
});
