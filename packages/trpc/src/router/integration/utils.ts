import { findOrgMembership } from "@superset/db/utils";
import { TRPCError } from "@trpc/server";

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
