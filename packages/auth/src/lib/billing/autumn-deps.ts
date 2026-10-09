import { db } from "@superset/db/client";
import { subscriptions } from "@superset/db/schema";
import { and, desc, eq, inArray } from "drizzle-orm";
import { autumnClient } from "../../autumn";
import { countBillableSeats } from "../../utils/billing";
import type { AutumnBillingDeps } from "./autumn-endpoints";
import {
	currentAutumnPlanId,
	ensureAutumnCustomer,
	syncOrganizationSubscription,
} from "./sync-subscription";

export function autumnBillingDeps(): AutumnBillingDeps {
	if (!autumnClient) throw new Error("AUTUMN_SECRET_KEY is not set");
	const autumn = autumnClient;
	return {
		attach: (params) => autumn.billing.attach(params),
		update: (params) => autumn.billing.update(params),
		openCustomerPortal: (params) => autumn.billing.openCustomerPortal(params),
		ensureCustomer: ensureAutumnCustomer,
		currentPlanId: currentAutumnPlanId,
		findLiveSubscription: async (organizationId) =>
			(await db.query.subscriptions.findFirst({
				where: and(
					eq(subscriptions.referenceId, organizationId),
					inArray(subscriptions.status, ["active", "trialing"]),
				),
				orderBy: desc(subscriptions.createdAt),
			})) ?? null,
		countBillableSeats,
		sync: syncOrganizationSubscription,
	};
}
