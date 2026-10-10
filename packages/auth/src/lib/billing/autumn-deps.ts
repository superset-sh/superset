import { db } from "@superset/db/client";
import { subscriptions } from "@superset/db/schema";
import { APIError } from "better-auth/api";
import { and, desc, eq, inArray } from "drizzle-orm";
import { autumnClient } from "../../autumn";
import { env } from "../../env";
import { stripeClient } from "../../stripe";
import { countBillableSeats } from "../../utils/billing";
import type { AutumnBillingDeps } from "./autumn-endpoints";
import {
	currentAutumnPlanId,
	ensureAutumnCustomer,
	syncFromStripeEvent,
	syncOrganizationSubscription,
} from "./sync-subscription";

const SYNCED_STRIPE_EVENTS = new Set([
	"checkout.session.completed",
	"customer.subscription.created",
	"customer.subscription.updated",
	"customer.subscription.deleted",
	"invoice.paid",
	"invoice.payment_failed",
]);

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
		handleStripeWebhook: async (request) => {
			const signature = request.headers.get("stripe-signature");
			if (!signature) {
				throw new APIError("BAD_REQUEST", {
					message: "Stripe webhook secret not found",
				});
			}
			const event = await stripeClient.webhooks
				.constructEventAsync(
					await request.text(),
					signature,
					env.STRIPE_WEBHOOK_SECRET,
				)
				.catch(() => {
					throw new APIError("BAD_REQUEST", {
						message: "Failed to construct Stripe event",
					});
				});
			if (SYNCED_STRIPE_EVENTS.has(event.type)) {
				await syncFromStripeEvent(event);
			}
		},
	};
}
