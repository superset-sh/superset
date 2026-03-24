import { clearGitHubCachesForWorktree } from "../../workspaces/utils/github";
import { clearGitLabCachesForWorktree } from "../../workspaces/utils/gitlab";
import { clearVCSProviderCache } from "../../workspaces/utils/vcs-provider";
import { clearStatusCacheForWorktree } from "./status-cache";

export function clearWorktreeStatusCaches(worktreePath: string): void {
	clearGitHubCachesForWorktree(worktreePath);
	clearGitLabCachesForWorktree(worktreePath);
	clearVCSProviderCache(worktreePath);
	clearStatusCacheForWorktree(worktreePath);
}
