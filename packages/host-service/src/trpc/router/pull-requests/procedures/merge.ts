import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { projects, workspaces } from "../../../../db/schema";
import { mergePullRequestFromGlab } from "../../../../runtime/pull-requests/utils/gitlab-query";
import { protectedProcedure } from "../../../index";
import { actionRejectionError } from "../../github/github";
import { resolveLocalRepo } from "../../project/utils/resolve-repo";
import { resolveGithubRepo } from "../../workspace-creation/shared/project-helpers";

const mergeInputSchema = z
	.object({
		projectId: z.string().optional(),
		workspaceId: z.string().optional(),
		prNumber: z.number().int().positive(),
		mergeMethod: z.enum(["merge", "squash", "rebase"]).default("merge"),
		commitMessage: z.string().trim().min(1).optional(),
	})
	.refine((input) => Boolean(input.projectId) !== Boolean(input.workspaceId), {
		message: "Provide exactly one of projectId or workspaceId",
	});

/**
 * Project-scoped merge: resolves the repo live via resolveGithubRepo, same
 * as setState, instead of trusting a project's cached repoOwner/repoName —
 * those go stale if the remote is renamed or re-pointed after setup.
 */
export const mergePR = protectedProcedure
	.input(mergeInputSchema)
	.mutation(async ({ ctx, input }) => {
		const projectId =
			input.projectId ??
			ctx.db
				.select({ projectId: workspaces.projectId })
				.from(workspaces)
				.where(eq(workspaces.id, input.workspaceId as string))
				.get()?.projectId;
		if (!projectId) {
			throw new TRPCError({
				code: "NOT_FOUND",
				message: "Workspace is not linked to a project",
			});
		}

		const project = ctx.db
			.select()
			.from(projects)
			.where(eq(projects.id, projectId))
			.get();
		if (!project) {
			throw new TRPCError({
				code: "NOT_FOUND",
				message: "Project is not set up on this host",
			});
		}

		if (project.repoProvider === "gitlab") {
			const resolved = await resolveLocalRepo(project.repoPath, {
				remoteName: project.remoteName ?? undefined,
			});
			if (
				!project.remoteName ||
				resolved.remoteName !== project.remoteName ||
				resolved.parsed?.provider !== "gitlab"
			) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "Configured GitLab remote is no longer available",
				});
			}
			try {
				await mergePullRequestFromGlab(
					ctx.execGlab,
					resolved.parsed,
					input.prNumber,
					input.mergeMethod,
					resolved.repoPath,
					input.commitMessage,
				);
				return { merged: true };
			} catch (error) {
				throw actionRejectionError(error, "GitLab refused the merge.");
			}
		}

		const repo = await resolveGithubRepo(ctx, projectId);
		const octokit = await ctx.github();
		try {
			const { data } = await octokit.pulls.merge({
				owner: repo.owner,
				repo: repo.name,
				pull_number: input.prNumber,
				merge_method: input.mergeMethod,
				...(input.commitMessage ? { commit_message: input.commitMessage } : {}),
			});
			return data;
		} catch (error) {
			throw actionRejectionError(error, "GitHub refused the merge.");
		}
	});
