import { TRPCError } from "@trpc/server";

interface CachedOrganizationAuth {
	token: string | null;
	organizationIds: string[] | null;
}

export function requireOrganizationMemberToken(
	auth: CachedOrganizationAuth,
	organizationId: string,
): string {
	if (!auth.token) {
		throw new TRPCError({
			code: "UNAUTHORIZED",
			message: "No auth token available — user must be logged in",
		});
	}
	if (!auth.organizationIds?.includes(organizationId)) {
		throw new TRPCError({
			code: "FORBIDDEN",
			message: "Organization is not in the authenticated membership set",
		});
	}
	return auth.token;
}
