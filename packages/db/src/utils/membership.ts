import { and, eq, inArray } from "drizzle-orm";

import { db } from "../client";
import { members, type SelectMember } from "../schema/auth";
import { type SelectSubscription, subscriptions } from "../schema/schema";

export type OrgMembershipResult = {
	membership: SelectMember;
	subscription: SelectSubscription | null;
};

/**
 * Looks up a user's membership in an org and pulls the org's currently-paying
 * subscription in the same statement, so callers gating on plan don't need a
 * second round-trip. `subscription` is null if the org has no active/trialing
 * row.
 */
export async function findOrgMembership({
	userId,
	organizationId,
}: {
	userId: string;
	organizationId: string;
}): Promise<OrgMembershipResult | null> {
	const [row] = await db
		.select({
			membership: members,
			subscription: subscriptions,
		})
		.from(members)
		.leftJoin(
			subscriptions,
			and(
				eq(subscriptions.referenceId, members.organizationId),
				inArray(subscriptions.status, ["active", "trialing"]),
			),
		)
		.where(
			and(
				eq(members.organizationId, organizationId),
				eq(members.userId, userId),
			),
		)
		.limit(1);

	if (!row) return null;

	return {
		membership: row.membership,
		subscription: row.subscription,
	};
}
