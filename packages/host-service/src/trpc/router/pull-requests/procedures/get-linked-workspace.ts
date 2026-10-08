import { z } from "zod";
import { protectedProcedure } from "../../../index";
import { resolveGithubRepo } from "../../workspace-creation/shared/project-helpers";
import {
	findLinkedWorkspaceIds,
	findPullRequestRows,
	findPullRequestRowsByProject,
	type LinkedPullRequestRow,
} from "../shared/linked-workspaces";

const getLinkedWorkspaceInputSchema = z.object({
	projectId: z.string(),
	prNumber: z.number().int().positive(),
});

/**
 * Whichever live, non-archived workspace currently points at this PR, if
 * any. Used by the Code tab's "+" comment composer to decide whether to
 * send a prompt into an already-open workspace or spin up a new one. When
 * the project's repository cannot be resolved (checkout gone, remote
 * unreachable) the rows the project wrote itself still answer, so an
 * existing link is never mistaken for "none".
 */
export const getLinkedWorkspace = protectedProcedure
	.input(getLinkedWorkspaceInputSchema)
	.query(async ({ ctx, input }) => {
		let rows: LinkedPullRequestRow[];
		try {
			const repo = await resolveGithubRepo(ctx, input.projectId);
			rows = findPullRequestRows(ctx.db, repo, input.prNumber);
		} catch {
			rows = findPullRequestRowsByProject(
				ctx.db,
				input.projectId,
				input.prNumber,
			);
		}
		const [workspaceId = null] = findLinkedWorkspaceIds(
			ctx.db,
			rows.map((row) => row.id),
		);
		return { workspaceId };
	});
