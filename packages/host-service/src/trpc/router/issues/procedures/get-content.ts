import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { protectedProcedure } from "../../../index";
import {
	resolveGithubRepo,
	resolveGitLabRepo,
} from "../../workspace-creation/shared/project-helpers";
import { execGh } from "../../workspace-creation/utils/exec-gh";

const getContentInputSchema = z.object({
	projectId: z.string(),
	issueNumber: z.number().int().positive(),
	provider: z.enum(["github", "gitlab"]).optional(),
	instance: z.string().url().optional(),
	repoPath: z.string().optional(),
});

const ghIssueContentSchema = z.object({
	number: z.number(),
	title: z.string(),
	body: z.string().nullable().optional(),
	url: z.string(),
	state: z.string(),
	author: z.object({ login: z.string() }).optional(),
	createdAt: z.string().optional(),
	updatedAt: z.string().optional(),
});

const gitlabIssueContentSchema = z.object({
	iid: z.number().int().positive(),
	title: z.string(),
	description: z.string().nullable().optional(),
	web_url: z.string().url(),
	state: z.string(),
	author: z.object({ username: z.string() }).nullable().optional(),
	created_at: z.string().optional(),
	updated_at: z.string().optional(),
});

export const getContent = protectedProcedure
	.input(getContentInputSchema)
	.query(async ({ ctx, input }) => {
		if (input.provider === "gitlab") {
			if (!input.instance || !input.repoPath) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "GitLab issue identity requires an instance and repository.",
				});
			}
			const repo = await resolveGitLabRepo(ctx, input.projectId);
			if (
				repo.instance.toLowerCase() !== input.instance.toLowerCase() ||
				repo.repoPath.toLowerCase() !== input.repoPath.toLowerCase()
			) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message:
						"The GitLab issue does not match the project's current remote.",
				});
			}
			const project = encodeURIComponent(
				String(repo.projectId ?? repo.repoPath),
			);
			const data = gitlabIssueContentSchema.parse(
				await ctx.gitlab.api<unknown>(
					repo,
					`projects/${project}/issues/${input.issueNumber}`,
				),
			);
			return {
				number: data.iid,
				title: data.title,
				body: data.description ?? "",
				url: data.web_url,
				state: data.state === "opened" ? "open" : "closed",
				author: data.author?.username ?? null,
				createdAt: data.created_at,
				updatedAt: data.updated_at,
				provider: "gitlab" as const,
				instance: repo.instance,
				repoPath: repo.repoPath,
			};
		}

		const repo = await resolveGithubRepo(ctx, input.projectId);
		try {
			const raw = await execGh([
				"issue",
				"view",
				String(input.issueNumber),
				"--repo",
				`${repo.owner}/${repo.name}`,
				"--json",
				"number,title,body,url,state,author,createdAt,updatedAt",
			]);
			const data = ghIssueContentSchema.parse(raw);
			return {
				number: data.number,
				title: data.title,
				body: data.body ?? "",
				url: data.url,
				state: data.state.toLowerCase(),
				author: data.author?.login ?? null,
				createdAt: data.createdAt,
				updatedAt: data.updatedAt,
			};
		} catch (err) {
			throw new TRPCError({
				code: "INTERNAL_SERVER_ERROR",
				message: `Failed to fetch issue #${input.issueNumber}: ${err instanceof Error ? err.message : String(err)}`,
			});
		}
	});
