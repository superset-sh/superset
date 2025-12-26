import { LinearClient } from "@linear/sdk";
import { db } from "@superset/db/client";
import {
	integrationConnections,
	organizationMembers,
	users,
} from "@superset/db/schema";
import { and, eq } from "drizzle-orm";

type Priority = "urgent" | "high" | "medium" | "low" | "none";

export function mapPriorityToLinear(priority: Priority): number {
	switch (priority) {
		case "urgent":
			return 1;
		case "high":
			return 2;
		case "medium":
			return 3;
		case "low":
			return 4;
		default:
			return 0;
	}
}

export function mapPriorityFromLinear(linearPriority: number): Priority {
	switch (linearPriority) {
		case 1:
			return "urgent";
		case 2:
			return "high";
		case 3:
			return "medium";
		case 4:
			return "low";
		default:
			return "none";
	}
}

export async function getLinearClient(
	organizationId: string,
): Promise<LinearClient | null> {
	const connection = await db.query.integrationConnections.findFirst({
		where: and(
			eq(integrationConnections.organizationId, organizationId),
			eq(integrationConnections.provider, "linear"),
		),
	});

	if (!connection) {
		return null;
	}

	return new LinearClient({ accessToken: connection.accessToken });
}

export async function verifyOrgMembership(
	clerkUserId: string,
	organizationId: string,
) {
	const user = await db.query.users.findFirst({
		where: eq(users.clerkId, clerkUserId),
	});

	if (!user) {
		throw new Error("User not found");
	}

	const membership = await db.query.organizationMembers.findFirst({
		where: and(
			eq(organizationMembers.organizationId, organizationId),
			eq(organizationMembers.userId, user.id),
		),
	});

	if (!membership) {
		throw new Error("Not a member of this organization");
	}

	return { user, membership };
}

export async function verifyOrgAdmin(
	clerkUserId: string,
	organizationId: string,
) {
	const { user, membership } = await verifyOrgMembership(
		clerkUserId,
		organizationId,
	);

	if (membership.role !== "admin") {
		throw new Error("Admin access required");
	}

	return { user, membership };
}
