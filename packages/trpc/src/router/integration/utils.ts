import { db } from "@superset/db/client";
import { members } from "@superset/db/schema";
import { TRPCError } from "@trpc/server";
import { and, eq } from "drizzle-orm";

export async function verifyOrgMembership(
	userId: string,
	organizationId: string,
) {
	const membership = await db.query.members.findFirst({
		where: and(
			eq(members.organizationId, organizationId),
			eq(members.userId, userId),
		),
	});

	if (!membership) {
		throw new TRPCError({
			code: "FORBIDDEN",
			message: "Not a member of this organization",
		});
	}

	return { membership };
}

export async function verifyOrgAdmin(userId: string, organizationId: string) {
	const { membership } = await verifyOrgMembership(userId, organizationId);

	if (membership.role !== "admin" && membership.role !== "owner") {
		throw new TRPCError({
			code: "FORBIDDEN",
			message: "Admin access required",
		});
	}

	return { membership };
}
