import { eq } from "drizzle-orm";
import { z } from "zod";
import { workspaces } from "../../../db/schema";
import { GitHubProviderClient } from "../../../runtime/repo-providers/github/github-provider-client";
import { getProviderClient } from "../../../runtime/repo-providers/registry";
import type { MergeResult } from "../../../runtime/repo-providers/types";
import { protectedProcedure, router } from "../../index";
import { resolveRepo } from "../workspace-creation/shared/project-helpers";

export const githubRouter = router({
	getPRStatus: protectedProcedure
		.input(
			z.object({
				owner: z.string(),
				repo: z.string(),
				branch: z.string(),
			}),
		)
		.query(async ({ ctx, input }) => {
			const octokit = await ctx.github();
			const { data } = await octokit.pulls.list({
				owner: input.owner,
				repo: input.repo,
				head: `${input.owner}:${input.branch}`,
				state: "open",
			});
			return data[0] ?? null;
		}),

	getPR: protectedProcedure
		.input(
			z.object({
				owner: z.string(),
				repo: z.string(),
				pullNumber: z.number(),
			}),
		)
		.query(async ({ ctx, input }) => {
			const octokit = await ctx.github();
			const { data } = await octokit.pulls.get({
				owner: input.owner,
				repo: input.repo,
				pull_number: input.pullNumber,
			});
			return data;
		}),

	listPRs: protectedProcedure
		.input(
			z.object({
				owner: z.string(),
				repo: z.string(),
				state: z.enum(["open", "closed", "all"]).default("open"),
				sort: z
					.enum(["created", "updated", "popularity", "long-running"])
					.default("updated"),
				direction: z.enum(["asc", "desc"]).default("desc"),
				perPage: z.number().min(1).max(100).default(30),
				page: z.number().min(1).default(1),
			}),
		)
		.query(async ({ ctx, input }) => {
			const octokit = await ctx.github();
			const { data } = await octokit.pulls.list({
				owner: input.owner,
				repo: input.repo,
				state: input.state,
				sort: input.sort,
				direction: input.direction,
				per_page: input.perPage,
				page: input.page,
			});
			return data;
		}),

	getRepo: protectedProcedure
		.input(
			z.object({
				owner: z.string(),
				repo: z.string(),
			}),
		)
		.query(async ({ ctx, input }) => {
			const octokit = await ctx.github();
			const { data } = await octokit.repos.get({
				owner: input.owner,
				repo: input.repo,
			});
			return data;
		}),

	listDeployments: protectedProcedure
		.input(
			z.object({
				owner: z.string(),
				repo: z.string(),
				environment: z.string().optional(),
				ref: z.string().optional(),
				perPage: z.number().min(1).max(100).default(10),
			}),
		)
		.query(async ({ ctx, input }) => {
			const octokit = await ctx.github();
			const { data } = await octokit.repos.listDeployments({
				owner: input.owner,
				repo: input.repo,
				environment: input.environment,
				ref: input.ref,
				per_page: input.perPage,
			});
			return data;
		}),

	listDeploymentStatuses: protectedProcedure
		.input(
			z.object({
				owner: z.string(),
				repo: z.string(),
				deploymentId: z.number(),
				perPage: z.number().min(1).max(100).default(10),
			}),
		)
		.query(async ({ ctx, input }) => {
			const octokit = await ctx.github();
			const { data } = await octokit.repos.listDeploymentStatuses({
				owner: input.owner,
				repo: input.repo,
				deployment_id: input.deploymentId,
				per_page: input.perPage,
			});
			return data;
		}),

	getUser: protectedProcedure.query(async ({ ctx }) => {
		const octokit = await ctx.github();
		const { data } = await octokit.users.getAuthenticated();
		return data;
	}),

	mergePR: protectedProcedure
		.input(
			z.object({
				owner: z.string(),
				repo: z.string(),
				pullNumber: z.number(),
				mergeMethod: z.enum(["merge", "squash", "rebase"]).default("merge"),
				/** Optional: direct project id for provider routing. */
				projectId: z.string().optional(),
				/**
				 * Optional: workspace id. When `projectId` is absent but `workspaceId`
				 * is provided, the workspace's projectId is resolved first. This lets
				 * the renderer pass only the workspace id (which it always has) and
				 * still get correct GitLab routing without plumbing projectId down to
				 * every merge call site.
				 */
				workspaceId: z.string().optional(),
			}),
		)
		.mutation(async ({ ctx, input }): Promise<MergeResult> => {
			const repoRef = { owner: input.owner, name: input.repo };

			// Resolve projectId: prefer the explicit field, fall back to looking
			// up the workspace's projectId when only workspaceId was supplied.
			let resolvedProjectId = input.projectId;
			if (!resolvedProjectId && input.workspaceId) {
				const ws = ctx.db
					.select({ projectId: workspaces.projectId })
					.from(workspaces)
					.where(eq(workspaces.id, input.workspaceId))
					.get();
				resolvedProjectId = ws?.projectId;
			}

			// Route via provider when a project can be resolved — picks the correct
			// provider+host from the live git remote. Falls back to GitHub (Octokit)
			// when no project context is available (existing callers that supply neither).
			if (resolvedProjectId) {
				let repo: Awaited<ReturnType<typeof resolveRepo>>;
				try {
					repo = await resolveRepo(ctx, resolvedProjectId);
				} catch {
					// resolveRepo can throw for local-only repos. Fall through to GitHub.
					repo = {
						provider: "github",
						host: "github.com",
						owner: input.owner,
						name: input.repo,
						repoPath: "",
					};
				}

				if (repo.provider !== "unknown") {
					const client =
						repo.provider === "github"
							? new GitHubProviderClient({
									execGh: ctx.execGh,
									github: ctx.github,
								})
							: getProviderClient(repo.provider, repo.host);
					return client.mergePullRequest(
						repoRef,
						input.pullNumber,
						input.mergeMethod,
					);
				}
			}

			// GitHub-default path (no project context, or resolveRepo failed/unknown).
			const client = new GitHubProviderClient({
				execGh: ctx.execGh,
				github: ctx.github,
			});
			return client.mergePullRequest(
				repoRef,
				input.pullNumber,
				input.mergeMethod,
			);
		}),
});
