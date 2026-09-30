import { TRPCError } from "@trpc/server";
import { z } from "zod";
import {
	assertGitLabIdentity,
	getGitLabMergeRequest,
	gitLabMergeRequestApiPath,
} from "../../../../source-control/gitlab/merge-requests";
import { protectedProcedure } from "../../../index";
import {
	resolveGithubRepo,
	resolveGitLabRepo,
} from "../../workspace-creation/shared/project-helpers";

const addCommentInputSchema = z.object({
	projectId: z.string(),
	prNumber: z.number().int().positive(),
	provider: z.enum(["github", "gitlab"]).optional(),
	instance: z.string().optional(),
	repoPath: z.string().optional(),
	body: z.string().trim().min(1),
	position: z
		.object({
			path: z.string().min(1),
			oldPath: z.string().min(1).optional(),
			line: z.number().int().positive(),
			side: z.enum(["LEFT", "RIGHT"]),
			headSha: z.string().regex(/^[a-f\d]{40,64}$/i),
		})
		.optional(),
});

export const addComment = protectedProcedure
	.input(addCommentInputSchema)
	.mutation(async ({ ctx, input }) => {
		if (input.provider === "gitlab") {
			const identity = await resolveGitLabRepo(ctx, input.projectId);
			assertGitLabIdentity(identity, input);
			const requestPath = gitLabMergeRequestApiPath(identity, input.prNumber);
			if (input.position) {
				const mergeRequest = await getGitLabMergeRequest(
					ctx.gitlab,
					identity,
					input.prNumber,
				);
				if (mergeRequest.sha !== input.position.headSha) {
					throw new TRPCError({
						code: "CONFLICT",
						message:
							"The merge request changed since it was reviewed. Refresh and try again.",
					});
				}
				const refs = mergeRequest.diff_refs;
				if (
					!refs?.base_sha ||
					!refs.start_sha ||
					!refs.head_sha ||
					refs.head_sha !== input.position.headSha
				) {
					throw new TRPCError({
						code: "PRECONDITION_FAILED",
						message:
							"Merge request diff positions are not ready. Refresh and try again.",
					});
				}
				const response = await ctx.gitlab.api<{
					id: string;
					notes: Array<{ id: number }>;
				}>(identity, `${requestPath}/discussions`, {
					method: "POST",
					fields: {
						body: input.body,
						position: {
							position_type: "text",
							base_sha: refs.base_sha,
							start_sha: refs.start_sha,
							head_sha: refs.head_sha,
							old_path: input.position.oldPath ?? input.position.path,
							new_path: input.position.path,
							...(input.position.side === "LEFT"
								? { old_line: input.position.line }
								: { new_line: input.position.line }),
						},
					},
				});
				return {
					id: response.id,
					url: `${identity.url}/-/merge_requests/${input.prNumber}#note_${response.notes[0]?.id ?? ""}`,
				};
			}
			const response = await ctx.gitlab.api<{ id: number }>(
				identity,
				`${requestPath}/notes`,
				{ method: "POST", fields: { body: input.body } },
			);
			return {
				id: String(response.id),
				url: `${identity.url}/-/merge_requests/${input.prNumber}#note_${response.id}`,
			};
		}

		const repo = await resolveGithubRepo(ctx, input.projectId);
		const octokit = await ctx.github();
		if (input.position) {
			const { data } = await octokit.pulls.createReviewComment({
				owner: repo.owner,
				repo: repo.name,
				pull_number: input.prNumber,
				body: input.body,
				commit_id: input.position.headSha,
				path: input.position.path,
				line: input.position.line,
				side: input.position.side,
			});
			return { id: String(data.id), url: data.html_url };
		}
		const { data } = await octokit.issues.createComment({
			owner: repo.owner,
			repo: repo.name,
			issue_number: input.prNumber,
			body: input.body,
		});
		return { id: String(data.id), url: data.html_url };
	});
