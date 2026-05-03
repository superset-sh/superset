import { z } from "zod";

export const searchBranchesInputSchema = z.object({
	projectId: z.string(),
	query: z.string().optional(),
	cursor: z.string().optional(),
	limit: z.number().min(1).max(200).optional(),
	refresh: z.boolean().optional(),
	filter: z.enum(["branch", "worktree"]).optional(),
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

export const githubIssueContentInputSchema = z.object({
	projectId: z.string(),
	issueNumber: z.number().int().positive(),
});

export const githubPullRequestContentInputSchema = z.object({
	projectId: z.string(),
	prNumber: z.number().int().positive(),
});

export const issueContentSchema = z.object({
	number: z.number(),
	title: z.string(),
	body: z.string().nullable().optional(),
	url: z.string(),
	state: z.string(),
	author: z.object({ login: z.string() }).optional(),
	createdAt: z.string().optional(),
	updatedAt: z.string().optional(),
});

export const pullRequestContentSchema = z.object({
	number: z.number(),
	title: z.string(),
	body: z.string().nullable().optional(),
	url: z.string(),
	state: z.string(),
	headRefName: z.string(),
	baseRefName: z.string(),
	// `gh pr view` returns null when the PR's head fork repository has been
	// deleted. Nullable so the schema parse doesn't fail; consumers decide
	// how to handle a missing owner (client surfaces a clear error for
	// cross-repo PRs — same-repo PRs shouldn't see null in practice).
	headRepositoryOwner: z.object({ login: z.string() }).nullable(),
	isCrossRepository: z.boolean(),
	isDraft: z.boolean(),
	author: z.object({ login: z.string() }).optional(),
	createdAt: z.string().optional(),
	updatedAt: z.string().optional(),
});
