import { db } from "@superset/db/client";
import { members } from "@superset/db/schema";
import { and, count, eq, ne } from "drizzle-orm";

/** The id of an organization that still has other members but no owner
 * besides this user, or null. Purging such a user would leave the others
 * with no one able to manage billing or membership. */
export async function findOrganizationSolelyOwnedBy(
	userId: string,
): Promise<string | null> {
	const ownerships = await db.query.members.findMany({
		where: and(eq(members.userId, userId), eq(members.role, "owner")),
	});
	for (const ownership of ownerships) {
		const [otherMembers] = await db
			.select({ value: count() })
			.from(members)
			.where(
				and(
					eq(members.organizationId, ownership.organizationId),
					ne(members.userId, userId),
				),
			);
		if ((otherMembers?.value ?? 0) === 0) continue;

		const [otherOwners] = await db
			.select({ value: count() })
			.from(members)
			.where(
				and(
					eq(members.organizationId, ownership.organizationId),
					eq(members.role, "owner"),
					ne(members.userId, userId),
				),
			);
		if ((otherOwners?.value ?? 0) === 0) return ownership.organizationId;
	}
	return null;
}
