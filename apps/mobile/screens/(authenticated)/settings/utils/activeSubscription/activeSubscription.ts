import type { SelectSubscription } from "@superset/db/schema";

const ACTIVE_STATUSES = new Set(["active", "trialing"]);

export function activeSubscription(
	subscriptions: SelectSubscription[],
): SelectSubscription | undefined {
	return subscriptions
		.filter((subscription) => ACTIVE_STATUSES.has(subscription.status))
		.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0];
}
