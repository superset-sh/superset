import { z } from "zod";

export const searchBranchesInputSchema = z.object({
	projectId: z.string(),
	query: z.string().optional(),
	cursor: z.string().optional(),
	limit: z.number().min(1).max(200).optional(),
	refresh: z.boolean().optional(),
	filter: z.enum(["all", "worktree"]).optional(),
});

export const adoptInputSchema = z.object({
	projectId: z.string(),
	workspaceName: z.string(),
	branch: z.string(),
	baseBranch: z.string().optional(),
	existingWorkspaceId: z.string().optional(),
	// When provided, adopt the worktree at this explicit path instead
	// of looking one up under <repoPath>/.worktrees/<branch>. Used by
	// the v1→v2 migration to adopt worktrees at legacy paths (e.g.
	// ~/.superset/worktrees/...) that aren't under the picker's
	// Superset-managed prefix.
	worktreePath: z.string().optional(),
});

export const githubSearchInputSchema = z.object({
	projectId: z.string(),
	query: z.string().optional(),
	limit: z.number().min(1).max(100).optional(),
	includeClosed: z.boolean().optional(),
});
