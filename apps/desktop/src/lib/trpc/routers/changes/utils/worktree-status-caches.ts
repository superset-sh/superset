import { clearGitHubCachesForWorktree } from "../../workspaces/utils/github";
import { clearStatusCacheForWorktree } from "./status-cache";

export function clearWorktreeStatusCaches(worktreePath: string): void {
	clearGitHubCachesForWorktree(worktreePath);
	clearStatusCacheForWorktree(worktreePath);
}
