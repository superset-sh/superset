import { and, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { workspaces } from "../../../../db/schema";
import { protectedProcedure } from "../../../index";
import {
	requireLocalProject,
	requireProjectRepoPath,
} from "../shared/local-project";
import {
	listGitWorktrees,
	normalizeWorktreePath,
} from "../shared/worktree-list";

/**
 * Returns the live `git worktree list` for a project — only entries that
 * are valid adoption targets (have a real branch checked out, not bare,
 * not prunable) — annotated with whether a workspace row already tracks
 * them. Used by the v1→v2 importer to filter out v1 workspaces whose
 * worktree no longer exists on disk, and by the sidebar's "Import
 * Worktrees" action to find untracked worktrees.
 */
export const listProjectWorktrees = protectedProcedure
	.input(z.object({ projectId: z.string() }))
	.query(async ({ ctx, input }) => {
		const localProject = requireLocalProject(ctx, input.projectId);
		const git = await ctx.git(requireProjectRepoPath(localProject));
		const records = await listGitWorktrees(git);

		// Tracking key is (projectId, branch) — same as searchBranches — but
		// also match by normalized path so a tracked worktree whose branch was
		// renamed out from under its row isn't offered for re-import.
		const workspaceRows = ctx.db
			.select()
			.from(workspaces)
			.where(
				and(
					eq(workspaces.projectId, input.projectId),
					isNull(workspaces.archivedAt),
				),
			)
			.all();
		const workspaceBranches = new Set(
			workspaceRows.map((row) => row.branch).filter(Boolean),
		);
		const workspacePaths = new Set(
			workspaceRows
				.map((row) => row.worktreePath)
				.filter(Boolean)
				.map(normalizeWorktreePath),
		);
		const mainRepoPath = normalizeWorktreePath(localProject.repoPath);

		const worktrees: {
			branch: string;
			path: string;
			hasWorkspace: boolean;
			isMainWorktree: boolean;
		}[] = [];
		for (const record of records) {
			if (record.bare) continue;
			if (record.prunable) continue;
			if (!record.branch) continue;
			const normalizedPath = normalizeWorktreePath(record.path);
			worktrees.push({
				branch: record.branch,
				path: record.path,
				hasWorkspace:
					workspaceBranches.has(record.branch) ||
					workspacePaths.has(normalizedPath),
				isMainWorktree: normalizedPath === mainRepoPath,
			});
		}
		return { worktrees };
	});
