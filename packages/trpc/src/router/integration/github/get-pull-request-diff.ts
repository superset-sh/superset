import type { PullRequestDiff } from "@superset/shared/pull-request-diff";
import { z } from "zod";
import { protectedProcedure } from "../../../trpc";
import { asViewer } from "./viewer-octokit";

// Errors stay unmapped: released desktops read this procedure's failures as-is.
export const getPullRequestDiff = protectedProcedure
	.input(
		z.object({
			organizationId: z.string().uuid(),
			repoFullName: z.string().regex(/^[\w.-]+\/[\w.-]+$/),
			number: z.number().int().positive(),
		}),
	)
	.query(
		async ({ ctx, input }): Promise<PullRequestDiff> =>
			(await asViewer(ctx.session.user.id, input, "read")).diff(),
	);
