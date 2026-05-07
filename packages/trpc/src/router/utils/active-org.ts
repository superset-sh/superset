import type { SelectSubscription } from "@superset/db/schema";
import { TRPCError } from "@trpc/server";
import {
	verifyOrgMembership,
	verifyOrgMembershipWithSubscription,
} from "../integration/utils";

type ActiveOrgContext = {
	userId: string;
	activeOrganizationId: string | null;
};

export function requireActiveOrgId(
	ctx: { activeOrganizationId: string | null },
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
	ctx: ActiveOrgContext,
	message?: string,
) {
	const organizationId = requireActiveOrgId(ctx, message);
	await verifyOrgMembership(ctx.userId, organizationId);
	return organizationId;
}

/**
 * Like `requireActiveOrgMembership` but also returns the org's currently-paying
 * subscription (joined by the same statement that resolved membership, so this
 * is free vs. the basic call). Use when a procedure needs to gate on plan.
 */
export async function requireActiveOrgMembershipWithSubscription(
	ctx: ActiveOrgContext,
	message?: string,
): Promise<{
	organizationId: string;
	subscription: SelectSubscription | null;
}> {
	const organizationId = requireActiveOrgId(ctx, message);
	const { subscription } = await verifyOrgMembershipWithSubscription(
		ctx.userId,
		organizationId,
	);
	return { organizationId, subscription };
}
