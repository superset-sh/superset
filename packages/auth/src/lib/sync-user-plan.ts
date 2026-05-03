import { db } from "@superset/db/client";
import { members, subscriptions } from "@superset/db/schema";
import {
	isActiveSubscriptionStatus,
	isPaidPlan,
} from "@superset/shared/billing";
import { eq } from "drizzle-orm";
import { posthog } from "./posthog";

const PLAN_TIER_RANK: Record<string, number> = {
	enterprise: 2,
	pro: 1,
	free: 0,
};

async function bestPlanForUser(userId: string): Promise<string | null> {
	const rows = await db
		.select({ plan: subscriptions.plan, status: subscriptions.status })
		.from(members)
		.leftJoin(
			subscriptions,
			eq(subscriptions.referenceId, members.organizationId),
		)
		.where(eq(members.userId, userId));

	const paying = rows.filter(
		(row) => isPaidPlan(row.plan) && isActiveSubscriptionStatus(row.status),
	);

	const best = paying
		.slice()
		.sort(
			(a, b) =>
				(PLAN_TIER_RANK[b.plan ?? ""] ?? 0) -
				(PLAN_TIER_RANK[a.plan ?? ""] ?? 0),
		)[0];

	return best?.plan ?? null;
}

export async function syncUserPlan(userId: string): Promise<void> {
	if (!posthog) return;
	try {
		const plan = await bestPlanForUser(userId);
		posthog.capture({
			distinctId: userId,
			event: "$set",
			properties: { $set: { plan } },
		});
	} catch (error) {
		console.error("[posthog/sync-user-plan] Failed", error);
	}
}

export async function syncOrganizationMembersPlan(
	organizationId: string,
): Promise<void> {
	try {
		const orgMembers = await db.query.members.findMany({
			where: eq(members.organizationId, organizationId),
			columns: { userId: true },
		});
		await Promise.all(orgMembers.map((member) => syncUserPlan(member.userId)));
	} catch (error) {
		console.error("[posthog/sync-organization-members-plan] Failed", error);
	}
}
