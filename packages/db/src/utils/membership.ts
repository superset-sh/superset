import { ACTIVE_SUBSCRIPTION_STATUSES } from "@superset/shared/billing";
import { and, desc, eq, inArray } from "drizzle-orm";

import { db } from "../client";
import { members, type SelectMember } from "../schema/auth";
import { type SelectSubscription, subscriptions } from "../schema/schema";

export async function findOrgMembership({
	userId,
	organizationId,
}: {
	userId: string;
	organizationId: string;
}): Promise<SelectMember | undefined> {
	return db.query.members.findFirst({
		where: and(
			eq(members.organizationId, organizationId),
			eq(members.userId, userId),
		),
	});
}

export type OrgMembershipWithSubscription = {
	membership: SelectMember;
	subscription: SelectSubscription | null;
};

/**
 * Same as `findOrgMembership` but pulls the org's currently-paying subscription
 * in the same statement, so callers gating on plan don't need a second
 * round-trip. `subscription` is null when the org has no active/trialing row.
 */
export async function findOrgMembershipWithSubscription({
	userId,
	organizationId,
}: {
	userId: string;
	organizationId: string;
}): Promise<OrgMembershipWithSubscription | null> {
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
				inArray(subscriptions.status, ACTIVE_SUBSCRIPTION_STATUSES),
			),
		)
		.where(
			and(
				eq(members.organizationId, organizationId),
				eq(members.userId, userId),
			),
		)
		.orderBy(desc(subscriptions.createdAt))
		.limit(1);

	if (!row) return null;
	return { membership: row.membership, subscription: row.subscription };
}
