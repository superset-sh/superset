import { db } from "@superset/db/client";
import { pages } from "@superset/db/schema";
import { parseGithubPullRequestUrl } from "@superset/shared/github-pr-url";
import type { TRPCRouterRecord } from "@trpc/server";
import { and, eq } from "drizzle-orm";
import { protectedProcedure } from "../../trpc";
import { pageUrl } from "../page/page-url";
import { requireActiveOrgMembership } from "../utils/active-org";
import { findLinkedPageId } from "./anchor";
import { publishReview } from "./publish";
import { getReviewForPullRequestSchema, publishReviewSchema } from "./schema";

export const reviewRouter = {
	publish: protectedProcedure
		.input(publishReviewSchema)
		.mutation(async ({ ctx, input }) => {
			const organizationId = await requireActiveOrgMembership(ctx);
			return await publishReview({
				input,
				organizationId,
				userId: ctx.session.user.id,
			});
		}),

	getForPullRequest: protectedProcedure
		.input(getReviewForPullRequestSchema)
		.query(async ({ ctx, input }) => {
			const organizationId = await requireActiveOrgMembership(ctx);
			const userId = ctx.session.user.id;

			// The schema's refine guarantees this parses.
			const pr = parseGithubPullRequestUrl(input.prUrl);
			if (!pr) return null;

			const pageId = await findLinkedPageId(organizationId, pr);
			if (!pageId) return null;

			const [page] = await db
				.select()
				.from(pages)
				.where(
					and(eq(pages.id, pageId), eq(pages.organizationId, organizationId)),
				)
				.limit(1);
			if (!page) return null;
			// A linked page the caller can't read (private, someone else's) is
			// indistinguishable from "no review" to this caller — return null
			// for both instead of throwing for one and not the other.
			if (page.visibility === "just_me" && page.createdByUserId !== userId) {
				return null;
			}

			return {
				id: page.id,
				slug: page.slug,
				url: pageUrl(page.slug),
				title: page.title,
				visibility: page.visibility,
			};
		}),
} satisfies TRPCRouterRecord;
