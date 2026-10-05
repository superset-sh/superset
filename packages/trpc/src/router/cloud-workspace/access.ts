import { db } from "@superset/db/client";
import { cloudWorkspaces } from "@superset/db/schema";
import { eq, or } from "drizzle-orm";
import { assertCloudAccess, assertMember } from "../../lib/cloud-guards";
import { userError } from "../../trpc";

/** Private boxes are their creator's alone; everyone else is told they don't exist. */
export function isVisibleTo(
	row: Pick<
		typeof cloudWorkspaces.$inferSelect,
		"visibility" | "createdByUserId"
	>,
	userId: string,
) {
	return row.visibility === "org" || row.createdByUserId === userId;
}

export const visibleTo = (userId: string) =>
	or(
		eq(cloudWorkspaces.visibility, "org"),
		eq(cloudWorkspaces.createdByUserId, userId),
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
	if (!isVisibleTo(row, ctx.userId)) throw notFound();
	return row;
}
