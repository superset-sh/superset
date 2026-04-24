import { TRPCError } from "@trpc/server";
import type { TRPCContext } from "../../trpc";
import { verifyOrgMembership } from "../integration/utils";

type Session = NonNullable<TRPCContext["session"]>;

type ProtectedContext = {
	session: Session;
	activeOrganizationId: string | null;
};

export function requireActiveOrgId(
	ctx: ProtectedContext,
	message = "No active organization selected",
) {
	const organizationId = ctx.activeOrganizationId;

	if (!organizationId) {
		throw new TRPCError({
			code: "FORBIDDEN",
			message,
		});
	}

	return organizationId;
}

export async function requireActiveOrgMembership(
	ctx: ProtectedContext,
	message?: string,
) {
	const organizationId = requireActiveOrgId(ctx, message);
	await verifyOrgMembership(ctx.session.user.id, organizationId);
	return organizationId;
}
