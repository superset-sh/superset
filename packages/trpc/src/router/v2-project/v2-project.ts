import { db } from "@superset/db/client";
import { organizations, v2Projects } from "@superset/db/schema";
import { parseGitHubRemote } from "@superset/shared/github-remote";
import type { TRPCRouterRecord } from "@trpc/server";
import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { jwtProcedure, userError } from "../../trpc";

export const v2ProjectRouter = {
	findByGitHubRemote: jwtProcedure
		.input(
			z.object({
				organizationId: z.string().uuid(),
				repoCloneUrl: z.string().min(1),
			}),
		)
		.query(async ({ ctx, input }) => {
			if (!ctx.organizationIds.includes(input.organizationId)) {
				throw userError({
					code: "FORBIDDEN",
					message: "Not a member of this organization",
					i18nKey: "serverError.v2Project.notAMemberOfThisOrganization",
				});
			}
			const parsed = parseGitHubRemote(input.repoCloneUrl);
			if (!parsed) return { candidates: [] };
			// GitHub slugs are case-insensitive; parseGitHubRemote returns a
			// canonical https URL. Compare lower-cased on both sides.
			const canonicalUrl = parsed.url.toLowerCase();

			const rows = await db
				.select({
					id: v2Projects.id,
					name: v2Projects.name,
					slug: v2Projects.slug,
					organizationId: v2Projects.organizationId,
					organizationName: organizations.name,
				})
				.from(v2Projects)
				.innerJoin(
					organizations,
					eq(v2Projects.organizationId, organizations.id),
				)
				.where(
					and(
						eq(sql`lower(${v2Projects.repoCloneUrl})`, canonicalUrl),
						eq(v2Projects.organizationId, input.organizationId),
					),
				);

			return { candidates: rows };
		}),
} satisfies TRPCRouterRecord;
