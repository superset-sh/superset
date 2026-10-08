import { db } from "@superset/db/client";
import {
	cloudWorkspaceShares,
	cloudWorkspaces,
	pageShares,
	pages,
} from "@superset/db/schema";
import { and, eq, inArray, sql } from "drizzle-orm";

const SHARE_TABLES = [
	{ table: "cloud_workspace_shares", resource: "cloud_workspace_id" },
	{ table: "page_shares", resource: "page_id" },
] as const;

/**
 * Turns shares made to `email`'s invitations into shares to the member they
 * became. A share the member already has, or a second one from an earlier
 * invitation to the same resource, is dropped instead, since each resource
 * allows one share per member.
 */
export async function convertPendingShares({
	organizationId,
	userId,
	email,
}: {
	organizationId: string;
	userId: string;
	email: string;
}) {
	for (const { table, resource } of SHARE_TABLES) {
		const shares = sql.identifier(table);
		const resourceColumn = sql.identifier(resource);
		await db.execute(sql`
			with pending as (
				select s.id,
					(row_number() over (partition by s.${resourceColumn} order by s.created_at) > 1
						or exists (
							select 1 from ${shares} d
							where d.${resourceColumn} = s.${resourceColumn} and d.user_id = ${userId}
						)) as redundant
				from ${shares} s
				where s.invitation_id in (
					select i.id from auth.invitations i
					where i.organization_id = ${organizationId}
						and lower(i.email) = lower(${email})
				)
			),
			dropped as (
				delete from ${shares} where id in (select id from pending where redundant)
			)
			update ${shares} set user_id = ${userId}, invitation_id = null
			where id in (select id from pending where not redundant)
		`);
	}
}

/** Without this, a member who rejoins would quietly get their old shares back. */
export async function removeMemberShares({
	organizationId,
	userId,
}: {
	organizationId: string;
	userId: string;
}) {
	await db
		.delete(cloudWorkspaceShares)
		.where(
			and(
				eq(cloudWorkspaceShares.userId, userId),
				inArray(
					cloudWorkspaceShares.cloudWorkspaceId,
					db
						.select({ id: cloudWorkspaces.id })
						.from(cloudWorkspaces)
						.where(eq(cloudWorkspaces.organizationId, organizationId)),
				),
			),
		);
	await db
		.delete(pageShares)
		.where(
			and(
				eq(pageShares.userId, userId),
				inArray(
					pageShares.pageId,
					db
						.select({ id: pages.id })
						.from(pages)
						.where(eq(pages.organizationId, organizationId)),
				),
			),
		);
}

/** A cancelled or declined invitation leaves nothing to convert; its shares go with it. */
export async function removeInvitationShares(invitationId: string) {
	await db
		.delete(cloudWorkspaceShares)
		.where(eq(cloudWorkspaceShares.invitationId, invitationId));
	await db.delete(pageShares).where(eq(pageShares.invitationId, invitationId));
}
