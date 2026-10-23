import { z } from "zod";
import { protectedProcedure, router } from "../../index";
import { addComment } from "./procedures/add-comment";
import { createForWorkspace } from "./procedures/create-for-workspace";
import { getContent } from "./procedures/get-content";
import { getContentByRepo } from "./procedures/get-content-by-repo";
import { getDiff } from "./procedures/get-diff";
import { getDiffByRepo } from "./procedures/get-diff-by-repo";
import { getLinkedWorkspace } from "./procedures/get-linked-workspace";
import { getThreads } from "./procedures/get-threads";
import { mergePR } from "./procedures/merge";
import { replyToThread } from "./procedures/reply-to-thread";
import { setDraft } from "./procedures/set-draft";
import { setState } from "./procedures/set-state";
import { setThreadResolution } from "./procedures/set-thread-resolution";

export const pullRequestsRouter = router({
	getByWorkspaces: protectedProcedure
		.input(
			z.object({
				workspaceIds: z.array(z.string()),
			}),
		)
		.query(async ({ ctx, input }) => {
			const workspaces =
				await ctx.runtime.pullRequests.getPullRequestsByWorkspaces(
					input.workspaceIds,
				);
			// Why links may be stale: the sweep keeps existing links through a
			// rate limit, outage, or rejected credential but cannot create new
			// ones, and a workspace with no PR chip says nothing on its own.
			return {
				workspaces,
				github: ctx.runtime.pullRequests.getGithubStatus(),
			};
		}),
	/**
	 * Every PR each workspace has ever been linked to, current one first.
	 * `getByWorkspaces` stays the sidebar's view (the one currently-linked PR,
	 * honoring Remove PR Link); this is the full record behind it.
	 */
	historyByWorkspaces: protectedProcedure
		.input(
			z.object({
				workspaceIds: z.array(z.string()),
			}),
		)
		.query(async ({ ctx, input }) => {
			const workspaces =
				await ctx.runtime.pullRequests.getPullRequestHistoryByWorkspaces(
					input.workspaceIds,
				);
			return { workspaces };
		}),
	unlinkFromWorkspace: protectedProcedure
		.input(
			z.object({
				workspaceId: z.string(),
			}),
		)
		.mutation(({ ctx, input }) => {
			ctx.runtime.pullRequests.unlinkWorkspacePullRequest(input.workspaceId);
			return { ok: true };
		}),
	refreshByWorkspaces: protectedProcedure
		.input(
			z.object({
				workspaceIds: z.array(z.string()),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			await ctx.runtime.pullRequests.refreshPullRequestsByWorkspaces(
				input.workspaceIds,
			);
			return { ok: true };
		}),
	/** @deprecated Use the API's `integration.github.addPullRequestComment`, which acts as the viewer. Kept for released clients. */
	addComment,
	createForWorkspace,
	/** @deprecated Use the API's `integration.github.getPullRequestDetail` with `activity: true`, which acts as the viewer. Kept for released clients. */
	getContent,
	/** @deprecated Use the API's `integration.github.getPullRequestDetail` with `activity: true`, which acts as the viewer. Kept for released clients. */
	getContentByRepo,
	/** @deprecated Use the API's `integration.github.getPullRequestDiff`, which acts as the viewer. Kept for released clients. */
	getDiff,
	/** @deprecated Use the API's `integration.github.getPullRequestDiff`, which acts as the viewer. Kept for released clients. */
	getDiffByRepo,
	getLinkedWorkspace,
	/** @deprecated Use the API's `integration.github.getPullRequestThreads`, which acts as the viewer. Kept for released clients. */
	getThreads,
	/** @deprecated Use the API's `integration.github.setPullRequestDraft`, which acts as the viewer. Kept for released clients. */
	setDraft,
	/** @deprecated Use the API's `integration.github.setPullRequestState`, which acts as the viewer. Kept for released clients. */
	setState,
	/** @deprecated Use the API's `integration.github.setPullRequestThreadResolution`, which acts as the viewer. Kept for released clients. */
	setThreadResolution,
	/** @deprecated Use the API's `integration.github.replyToPullRequestThread`, which acts as the viewer. Kept for released clients. */
	replyToThread,
	/** @deprecated Use the API's `integration.github.mergePullRequest`, which acts as the viewer. Kept for released clients. */
	mergePR,
});
