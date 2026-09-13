import { and, desc, eq, isNull, sql } from "drizzle-orm";
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
		if (!pr) return { workspaceId: null, isShelved: false };

		// workspaces.pullRequestId has no unique constraint — more than one
		// non-archived workspace can link to the same PR (two worktrees
		// checking out the same branch, a stale duplicate). Break the tie
		// deterministically by preferring a workspace the user can actually
		// see — shelving one is what makes it stale — and then by the most
		// recently active, instead of an arbitrary DB row order.
		const workspace = ctx.db
			.select({ id: workspaces.id, shelvedAt: workspaces.shelvedAt })
			.from(workspaces)
			.where(
				and(eq(workspaces.pullRequestId, pr.id), isNull(workspaces.archivedAt)),
			)
			.orderBy(
				sql`${workspaces.shelvedAt} is not null`,
				desc(workspaces.updatedAt),
				desc(workspaces.createdAt),
			)
			.get();
		// A query never restores what it finds: the caller decides whether
		// sending into a shelved workspace is worth unshelving it.
		return {
			workspaceId: workspace?.id ?? null,
			isShelved: workspace?.shelvedAt != null,
		};
	});
