import type { PullRequestDetailRead } from "@superset/shared/pull-request-detail";
import type { TRPCRouterRecord } from "@trpc/server";
import { z } from "zod";
import { protectedProcedure } from "../../../trpc";
import { githubRequestError } from "./github-request-error";
import { asViewer } from "./viewer-octokit";

const pullRequestInput = z.object({
	organizationId: z.string().uuid(),
	repoFullName: z.string().regex(/^[\w.-]+\/[\w.-]+$/),
	number: z.number().int().positive(),
});
// GitHub rejects bodies past 65536 characters.
const body = z.string().trim().min(1).max(65536);

async function onGithub<T>(
	fallback: string,
	run: () => Promise<T>,
): Promise<T> {
	try {
		return await run();
	} catch (error) {
		throw githubRequestError(error, fallback);
	}
}

/**
 * A pull request by its own identity, read and written as the person asking.
 * The work is `@superset/shared/pull-request-github`, which the desktop also
 * runs with the `gh` login on the person's own machine.
 */
export const pullRequestProcedures = {
	/** Mergeability, checks, reviewers and the viewer's own capabilities; with `activity`, the conversation and commits too. */
	getPullRequestDetail: protectedProcedure
		.input(pullRequestInput.extend({ activity: z.boolean().optional() }))
		.query(async ({ ctx, input }): Promise<PullRequestDetailRead> => {
			const pr = await asViewer(ctx.session.user.id, input, "read");
			return onGithub(`Failed to read pull request #${pr.number}`, () =>
				pr.detail({ activity: input.activity }),
			);
		}),

	getPullRequestThreads: protectedProcedure
		.input(pullRequestInput)
		.query(async ({ ctx, input }) =>
			(await asViewer(ctx.session.user.id, input, "read")).threads(),
		),

	addPullRequestComment: protectedProcedure
		.input(pullRequestInput.extend({ body }))
		.mutation(async ({ ctx, input }) => {
			const pr = await asViewer(ctx.session.user.id, input, "write");
			return onGithub("GitHub refused the comment.", () =>
				pr.comment(input.body),
			);
		}),

	replyToPullRequestThread: protectedProcedure
		.input(
			pullRequestInput.extend({ commentId: z.number().int().positive(), body }),
		)
		.mutation(async ({ ctx, input }) => {
			const pr = await asViewer(ctx.session.user.id, input, "write");
			return onGithub("GitHub refused the reply.", () =>
				pr.reply(input.commentId, input.body),
			);
		}),

	setPullRequestThreadResolution: protectedProcedure
		.input(
			pullRequestInput.extend({
				threadId: z.string().min(1),
				resolved: z.boolean(),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			const pr = await asViewer(ctx.session.user.id, input, "write");
			return onGithub("GitHub refused to update the thread.", () =>
				pr.resolveThread(input.threadId, input.resolved),
			);
		}),

	mergePullRequest: protectedProcedure
		.input(
			pullRequestInput.extend({
				mergeMethod: z.enum(["merge", "squash", "rebase"]).default("merge"),
				commitMessage: z.string().trim().min(1).optional(),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			const pr = await asViewer(ctx.session.user.id, input, "write");
			return onGithub("GitHub refused the merge.", () =>
				pr.merge({
					mergeMethod: input.mergeMethod,
					commitMessage: input.commitMessage,
				}),
			);
		}),

	setPullRequestState: protectedProcedure
		.input(pullRequestInput.extend({ state: z.enum(["open", "closed"]) }))
		.mutation(async ({ ctx, input }) => {
			const pr = await asViewer(ctx.session.user.id, input, "write");
			await onGithub(
				`GitHub refused to ${input.state === "closed" ? "close" : "reopen"} the pull request.`,
				() => pr.setState(input.state),
			);
			return { ok: true as const };
		}),

	setPullRequestDraft: protectedProcedure
		.input(pullRequestInput.extend({ draft: z.boolean() }))
		.mutation(async ({ ctx, input }) => {
			const pr = await asViewer(ctx.session.user.id, input, "write");
			await onGithub(
				input.draft
					? "GitHub refused to convert the pull request to a draft."
					: "GitHub refused to mark the pull request ready for review.",
				() => pr.setDraft(input.draft),
			);
			return { ok: true as const };
		}),

	updatePullRequestBranch: protectedProcedure
		.input(pullRequestInput)
		.mutation(async ({ ctx, input }) => {
			const pr = await asViewer(ctx.session.user.id, input, "write");
			await onGithub("GitHub refused to update the branch.", () =>
				pr.updateBranch(),
			);
			return { ok: true as const };
		}),

	dequeuePullRequest: protectedProcedure
		.input(pullRequestInput)
		.mutation(async ({ ctx, input }) => {
			const pr = await asViewer(ctx.session.user.id, input, "write");
			await onGithub(
				"GitHub refused to remove the pull request from the queue.",
				() => pr.dequeue(),
			);
			return { ok: true as const };
		}),
} satisfies TRPCRouterRecord;
