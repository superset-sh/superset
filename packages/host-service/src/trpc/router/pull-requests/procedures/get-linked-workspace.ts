import { and, desc, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { pullRequests, workspaces } from "../../../../db/schema";
import { protectedProcedure } from "../../../index";

const getLinkedWorkspaceInputSchema = z.object({
	projectId: z.string(),
	prNumber: z.number().int().positive(),
});

/**
 * Reverse (PR -> workspace) lookup. `workspaces.pullRequestId` is the single
 * "currently linked" pointer per workspace (see db/schema.ts), so this finds
 * whichever live, non-archived workspace currently points at this PR, if
 * any. Used by the Code tab's "+" comment composer to decide whether to
 * send a prompt into an already-open workspace or spin up a new one.
 */
export const getLinkedWorkspace = protectedProcedure
	.input(getLinkedWorkspaceInputSchema)
	.query(async ({ ctx, input }) => {
		const pr = ctx.db
			.select({ id: pullRequests.id })
			.from(pullRequests)
			.where(
				and(
					eq(pullRequests.projectId, input.projectId),
					eq(pullRequests.prNumber, input.prNumber),
				),
			)
			.get();
		if (!pr) return { workspaceId: null };

		// workspaces.pullRequestId has no unique constraint — more than one
		// non-archived workspace can link to the same PR (two worktrees
		// checking out the same branch, a stale duplicate). Break the tie
		// deterministically by picking the most recently active one instead
		// of an arbitrary DB row order.
		const workspace = ctx.db
			.select({ id: workspaces.id })
			.from(workspaces)
			.where(
				and(eq(workspaces.pullRequestId, pr.id), isNull(workspaces.archivedAt)),
			)
			.orderBy(desc(workspaces.updatedAt), desc(workspaces.createdAt))
			.get();
		return { workspaceId: workspace?.id ?? null };
	});
