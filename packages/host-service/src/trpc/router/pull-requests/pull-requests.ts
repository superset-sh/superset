import { z } from "zod";
import { protectedProcedure, router } from "../../index";
import { getContent } from "./procedures/get-content";
import { getDiff } from "./procedures/get-diff";
import { getLinkedWorkspace } from "./procedures/get-linked-workspace";
import { getThreads } from "./procedures/get-threads";
import { mergePR } from "./procedures/merge";
import { replyToThread } from "./procedures/reply-to-thread";
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
			return { workspaces };
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
	getContent,
	getDiff,
	getLinkedWorkspace,
	getThreads,
	setState,
	setThreadResolution,
	replyToThread,
	mergePR,
});
