import { clearGitHubStatusCacheForWorktree } from "../../workspaces/utils/github";
import { clearStatusCacheForWorktree } from "./status-cache";

export function clearWorktreeStatusCaches(worktreePath: string): void {
	clearGitHubStatusCacheForWorktree(worktreePath);
	clearStatusCacheForWorktree(worktreePath);
}
