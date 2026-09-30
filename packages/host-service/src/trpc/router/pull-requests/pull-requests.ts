import { z } from "zod";
import { protectedProcedure, router } from "../../index";
import { addComment } from "./procedures/add-comment";
import { createForWorkspace } from "./procedures/create-for-workspace";
import { getContent } from "./procedures/get-content";
import { getDiff } from "./procedures/get-diff";
import { getLinkedWorkspace } from "./procedures/get-linked-workspace";
import { getThreads } from "./procedures/get-threads";
import { markReady } from "./procedures/mark-ready";
import { mergePR } from "./procedures/merge";
import { replyToThread } from "./procedures/reply-to-thread";
import { setState } from "./procedures/set-state";
import { setThreadResolution } from "./procedures/set-thread-resolution";

export const pullRequestsRouter = router({
	getByWorkspaces: protectedProcedure
		.input(
			z.object({
				workspaceIds: z.array(z.string()),
				acceptedProviders: z.array(z.enum(["github", "gitlab"])).optional(),
			}),
		)
		.query(async ({ ctx, input }) => {
			const workspaces =
				await ctx.runtime.pullRequests.getPullRequestsByWorkspaces(
					input.workspaceIds,
				);
			const accepted = input.acceptedProviders ?? ["github"];
			// Why links may be stale: the sweep keeps existing links through a
			// rate limit, outage, or rejected credential but cannot create new
			// ones, and a workspace with no PR chip says nothing on its own.
			return {
				workspaces: workspaces.map((workspace) => ({
					...workspace,
					pullRequest:
						workspace.pullRequest &&
						accepted.includes(workspace.pullRequest.provider)
							? workspace.pullRequest
							: null,
				})),
				github: ctx.runtime.pullRequests.getGithubStatus(),
				gitlab: ctx.runtime.pullRequests.getGitLabStatus(),
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
				acceptedProviders: z.array(z.enum(["github", "gitlab"])).optional(),
			}),
		)
		.query(async ({ ctx, input }) => {
			const workspaces =
				await ctx.runtime.pullRequests.getPullRequestHistoryByWorkspaces(
					input.workspaceIds,
				);
			const accepted = input.acceptedProviders ?? ["github"];
			return {
				workspaces: workspaces.map((workspace) => ({
					...workspace,
					pullRequests: workspace.pullRequests.filter((request) =>
						accepted.includes(request.provider),
					),
				})),
			};
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
	createForWorkspace,
	getContent,
	getDiff,
	getLinkedWorkspace,
	getThreads,
	setState,
	setThreadResolution,
	replyToThread,
	mergePR,
	markReady,
	addComment,
});
