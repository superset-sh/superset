import { db } from "@superset/db/client";
import { subscriptions } from "@superset/db/schema";
import {
	ACTIVE_SUBSCRIPTION_STATUSES,
	type PlanTier,
	planTierFromSubscription,
} from "@superset/shared/billing";
import { and, desc, eq, inArray } from "drizzle-orm";

/**
 * The org's plan as billing.activePlan resolves it: the newest subscription
 * in a paying status, else free. Unrecognized plan names read as free — the
 * gate must fail closed on a plan string this build doesn't know.
 */
export async function organizationPlan(
	organizationId: string,
): Promise<PlanTier> {
	const [subscription] = await db
		.select({ plan: subscriptions.plan, status: subscriptions.status })
		.from(subscriptions)
		.where(
			and(
				eq(subscriptions.referenceId, organizationId),
				inArray(subscriptions.status, [...ACTIVE_SUBSCRIPTION_STATUSES]),
			),
		)
		.orderBy(desc(subscriptions.createdAt))
		.limit(1);
	return planTierFromSubscription(subscription);
}
