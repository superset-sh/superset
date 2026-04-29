import { findOrgMembership } from "@superset/db/utils";
import { TRPCError } from "@trpc/server";

export async function verifyOrgMembership(
	userId: string,
	organizationId: string,
) {
	const result = await findOrgMembership({ userId, organizationId });

	if (!result) {
		throw new TRPCError({
			code: "FORBIDDEN",
			message: "Not a member of this organization",
		});
	}

	return result;
}

export async function verifyOrgAdmin(userId: string, organizationId: string) {
	const result = await verifyOrgMembership(userId, organizationId);

	if (
		result.membership.role !== "admin" &&
		result.membership.role !== "owner"
	) {
		throw new TRPCError({
			code: "FORBIDDEN",
			message: "Admin access required",
		});
	}

	return result;
}
