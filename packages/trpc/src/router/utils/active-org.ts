import type { SelectSubscription } from "@superset/db/schema";
import { TRPCError } from "@trpc/server";
import type { TRPCContext } from "../../trpc";
import {
	verifyOrgMembership,
	verifyOrgMembershipWithSubscription,
} from "../integration/utils";

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

/**
 * Like `requireActiveOrgMembership` but also returns the org's currently-paying
 * subscription (joined by the same statement that resolved membership, so this
 * is free vs. the basic call). Use when a procedure needs to gate on plan.
 */
export async function requireActiveOrgMembershipWithSubscription(
	ctx: ProtectedContext,
	message?: string,
): Promise<{
	organizationId: string;
	subscription: SelectSubscription | null;
}> {
	const organizationId = requireActiveOrgId(ctx, message);
	const { subscription } = await verifyOrgMembershipWithSubscription(
		ctx.session.user.id,
		organizationId,
	);
	return { organizationId, subscription };
}
