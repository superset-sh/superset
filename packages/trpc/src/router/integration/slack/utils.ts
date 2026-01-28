import { db } from "@superset/db/client";
import { integrationConnections, members } from "@superset/db/schema";
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
		throw new Error("Not a member of this organization");
	}

	return { membership };
}

export async function verifyOrgAdmin(userId: string, organizationId: string) {
	const { membership } = await verifyOrgMembership(userId, organizationId);

	if (membership.role !== "admin" && membership.role !== "owner") {
		throw new Error("Admin access required");
	}

	return { membership };
}

export async function getSlackConnection(organizationId: string) {
	const connection = await db.query.integrationConnections.findFirst({
		where: and(
			eq(integrationConnections.organizationId, organizationId),
			eq(integrationConnections.provider, "slack"),
		),
	});

	return connection ?? null;
}
