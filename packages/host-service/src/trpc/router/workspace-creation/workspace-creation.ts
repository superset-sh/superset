import { router } from "../../index";
import {
	adopt,
	listProjectWorktrees,
	searchBranches,
	searchGitHubIssues,
	searchPullRequests,
} from "./procedures";

export const workspaceCreationRouter = router({
	searchBranches,
	adopt,
	listProjectWorktrees,
	searchGitHubIssues,
	searchPullRequests,
});
