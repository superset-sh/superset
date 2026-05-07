import { z } from "zod";
import { protectedProcedure } from "../../../index";
import { requireLocalProject } from "../shared/local-project";
import { listGitWorktrees } from "../shared/worktree-list";

/**
 * Returns the live `git worktree list` for a project — only entries that
 * are valid adoption targets (have a real branch checked out, not bare,
 * not prunable). Used by the v1→v2 importer to filter out v1 workspaces
 * whose worktree no longer exists on disk before showing them as
 * importable rows.
 */
export const listProjectWorktrees = protectedProcedure
	.input(z.object({ projectId: z.string() }))
	.query(async ({ ctx, input }) => {
		const localProject = requireLocalProject(ctx, input.projectId);
		const git = await ctx.git(localProject.repoPath);
		const records = await listGitWorktrees(git);
		const worktrees: { branch: string; path: string }[] = [];
		for (const record of records) {
			if (record.bare) continue;
			if (record.prunable) continue;
			if (!record.branch) continue;
			worktrees.push({ branch: record.branch, path: record.path });
		}
		return { worktrees };
	});
