import { TRPCError } from "@trpc/server";
import type { TRPCContext } from "../../trpc";
import { verifyOrgMembership } from "../integration/utils";

type Session = NonNullable<TRPCContext["session"]>;

export function requireActiveOrganizationId(
	session: Session,
	message = "No active organization selected",
) {
	const organizationId = session.session.activeOrganizationId;

	if (!organizationId) {
		throw new TRPCError({
			code: "FORBIDDEN",
			message,
		});
	}

	return organizationId;
}

export async function requireActiveOrgMembership(
	session: Session,
	message?: string,
) {
	const organizationId = requireActiveOrganizationId(session, message);
	await verifyOrgMembership(session.user.id, organizationId);
	return organizationId;
}
