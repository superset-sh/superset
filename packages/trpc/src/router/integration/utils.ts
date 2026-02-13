import { db } from "@superset/db/client";
import type { IntegrationProvider } from "@superset/db/enums";
import { integrationConnections } from "@superset/db/schema";
import { findOrgMembership } from "@superset/db/utils";
import { TRPCError } from "@trpc/server";
import { and, eq } from "drizzle-orm";

export async function verifyOrgMembership(
	userId: string,
	organizationId: string,
) {
	const membership = await findOrgMembership({ userId, organizationId });

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

export async function disconnectIntegration({
	organizationId,
	provider,
}: {
	organizationId: string;
	provider: IntegrationProvider;
}) {
	const result = await db
		.delete(integrationConnections)
		.where(
			and(
				eq(integrationConnections.organizationId, organizationId),
				eq(integrationConnections.provider, provider),
			),
		)
		.returning({ id: integrationConnections.id });

	if (result.length === 0) {
		return { success: false as const, error: "No connection found" };
	}

	return { success: true as const };
}
