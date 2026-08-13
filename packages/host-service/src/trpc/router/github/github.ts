import {
	GITHUB_MERGE_METHODS,
	type GitHubMergeCapabilities,
	isGitHubMergeMethodDisabled,
	normalizeGitHubRestMergeCapabilities,
} from "@superset/shared/github-merge-methods";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { protectedProcedure, router } from "../../index";

const REPOSITORY_MERGE_SETTINGS_QUERY = `
	query($owner: String!, $name: String!) {
		repository(owner: $owner, name: $name) {
			viewerDefaultMergeMethod
		}
	}
`;

interface RepositoryMergeSettingsResult {
	repository: {
		viewerDefaultMergeMethod: string | null;
	} | null;
}

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

			let viewerDefaultMergeMethod: string | null = null;
			try {
				const result = await octokit.graphql<RepositoryMergeSettingsResult>(
					REPOSITORY_MERGE_SETTINGS_QUERY,
					{
						owner: input.owner,
						name: input.repo,
					},
				);
				viewerDefaultMergeMethod =
					result.repository?.viewerDefaultMergeMethod ?? null;
			} catch (error) {
				// The REST settings are still useful when GraphQL does not expose
				// the viewer default (for example, with an older token scope).
				console.warn(
					`[github.getRepo] Failed to fetch viewer default merge method for ${input.owner}/${input.repo}:`,
					error,
				);
			}

			return { ...data, viewerDefaultMergeMethod };
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
				mergeMethod: z.enum(GITHUB_MERGE_METHODS).default("merge"),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			const octokit = await ctx.github();
			let repository: GitHubMergeCapabilities | null = null;
			try {
				const result = await octokit.repos.get({
					owner: input.owner,
					repo: input.repo,
				});
				repository = normalizeGitHubRestMergeCapabilities(result.data);
			} catch (error) {
				// Preserve the existing merge behavior when repository settings are
				// unavailable. Explicitly disabled methods are still rejected below.
				console.warn(
					`[github.mergePR] Failed to fetch merge settings for ${input.owner}/${input.repo}; continuing:`,
					error,
				);
			}

			if (isGitHubMergeMethodDisabled(repository, input.mergeMethod)) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: `Repository ${input.owner}/${input.repo} does not allow ${input.mergeMethod} merges.`,
				});
			}

			const { data } = await octokit.pulls.merge({
				owner: input.owner,
				repo: input.repo,
				pull_number: input.pullNumber,
				merge_method: input.mergeMethod,
			});
			return data;
		}),
});
