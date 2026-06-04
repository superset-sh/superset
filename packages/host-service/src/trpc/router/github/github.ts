import { z } from "zod";
import { protectedProcedure, router } from "../../index";

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
			}),
		)
		.mutation(async ({ ctx, input }) => {
			const octokit = await ctx.github();
			const { data } = await octokit.pulls.merge({
				owner: input.owner,
				repo: input.repo,
				pull_number: input.pullNumber,
				merge_method: input.mergeMethod,
			});
			return data;
		}),
});
