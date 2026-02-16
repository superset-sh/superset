import { and, eq } from "drizzle-orm";

import { db } from "../client";
import { members } from "../schema";

export async function findOrgMembership({
	userId,
	organizationId,
}: {
	userId: string;
	organizationId: string;
}) {
	return db.query.members.findFirst({
		where: and(
			eq(members.organizationId, organizationId),
			eq(members.userId, userId),
		),
	});
}
