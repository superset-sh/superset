import { router } from "../../index";
import {
	adopt,
	searchBranches,
	searchGitHubIssues,
	searchPullRequests,
} from "./procedures";

export const workspaceCreationRouter = router({
	searchBranches,
	adopt,
	searchGitHubIssues,
	searchPullRequests,
});
