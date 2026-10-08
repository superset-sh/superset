import { db } from "@superset/db/client";
import { cloudWorkspaceShares, cloudWorkspaces } from "@superset/db/schema";
import { and, eq, exists, or, sql } from "drizzle-orm";
import { assertCloudAccess, assertMember } from "../../lib/cloud-guards";
import { grantsTo, isCloudWorkspaceSharedWith } from "../../lib/sharing";
import { userError } from "../../trpc";

/**
 * Without the share check, which needs a query: private boxes are visible to
 * their creator and whoever they are shared with, and everyone else is told
 * they don't exist.
 */
export function isVisibleTo(
	row: Pick<
		typeof cloudWorkspaces.$inferSelect,
		"visibility" | "createdByUserId"
	>,
	userId: string,
) {
	return row.visibility === "org" || row.createdByUserId === userId;
}

export async function canOpenWorkspace(
	row: Pick<
		typeof cloudWorkspaces.$inferSelect,
		"id" | "visibility" | "createdByUserId"
	>,
	userId: string,
) {
	return (
		isVisibleTo(row, userId) ||
		(await isCloudWorkspaceSharedWith(row.id, userId))
	);
}

export const visibleTo = (userId: string) =>
	or(
		eq(cloudWorkspaces.visibility, "org"),
		eq(cloudWorkspaces.createdByUserId, userId),
		exists(
			db
				.select({ one: sql`1` })
				.from(cloudWorkspaceShares)
				.where(
					and(
						eq(cloudWorkspaceShares.cloudWorkspaceId, cloudWorkspaces.id),
						grantsTo(cloudWorkspaceShares, userId),
					),
				),
		),
	);

export const notFound = () =>
	userError({
		code: "NOT_FOUND",
		message: "Not found",
		i18nKey: "serverError.cloudWorkspace.notFound",
	});

export async function loadVisibleWorkspace(
	ctx: Parameters<typeof assertCloudAccess>[0] & {
		organizationIds: string[];
		userId: string;
	},
	id: string,
) {
	const row = await db.query.cloudWorkspaces.findFirst({
		where: eq(cloudWorkspaces.id, id),
	});
	if (!row) throw notFound();
	await assertCloudAccess(ctx);
	assertMember(ctx.organizationIds, row.organizationId);
	if (!(await canOpenWorkspace(row, ctx.userId))) throw notFound();
	return row;
}
