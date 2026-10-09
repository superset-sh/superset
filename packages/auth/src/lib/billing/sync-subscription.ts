import { db, dbWs } from "@superset/db/client";
import { subscriptions } from "@superset/db/schema";
import * as authSchema from "@superset/db/schema/auth";
import { and, desc, eq, isNull, sql } from "drizzle-orm";
import type Stripe from "stripe";
import { autumnClient } from "../../autumn";
import { stripeClient } from "../../stripe";
import { isPaidAutumnPlan, legacyPlanName, SEATS_FEATURE_ID } from "./plans";
import {
	notifySubscriptionCanceled,
	notifySubscriptionStarted,
} from "./subscription-events";
import {
	subscriptionRowFromStripe,
	subscriptionTransitions,
} from "./subscription-row";

const RECENT_STRIPE_SUBSCRIPTIONS = 5;

function requireAutumn() {
	if (!autumnClient) throw new Error("AUTUMN_SECRET_KEY is not set");
	return autumnClient;
}

export async function ensureAutumnCustomer(organizationId: string) {
	const org = await db.query.organizations.findFirst({
		where: eq(authSchema.organizations.id, organizationId),
		columns: { id: true, name: true, stripeCustomerId: true },
	});
	if (!org) throw new Error(`Organization ${organizationId} not found`);
	const autumn = requireAutumn();
	const customer = await autumn.customers.getOrCreate({
		customerId: org.id,
		name: org.name,
		...(org.stripeCustomerId ? { stripeId: org.stripeCustomerId } : {}),
	});
	if (org.stripeCustomerId && !customer.stripeId) {
		return autumn.customers.update({
			customerId: org.id,
			stripeId: org.stripeCustomerId,
		});
	}
	return customer;
}

export async function currentAutumnPlanId(
	organizationId: string,
): Promise<string | null> {
	const customer = await requireAutumn().customers.get({
		customerId: organizationId,
	});
	return (
		customer.subscriptions.find(
			(subscription) =>
				subscription.status === "active" &&
				!subscription.addOn &&
				isPaidAutumnPlan(subscription.planId),
		)?.planId ?? null
	);
}

export async function setAutumnSeats(
	organizationId: string,
	quantity: number,
): Promise<void> {
	const planId = await currentAutumnPlanId(organizationId);
	if (!planId) return;
	await requireAutumn().billing.update({
		customerId: organizationId,
		planId,
		featureQuantities: [{ featureId: SEATS_FEATURE_ID, quantity }],
	});
}

type SubscriptionRow = typeof subscriptions.$inferSelect;

async function writeRow(
	organizationId: string,
	stripeSubscription: Stripe.Subscription,
	planName: string | null,
	isLatest: boolean,
): Promise<{ previous?: SubscriptionRow; row?: SubscriptionRow }> {
	return dbWs.transaction(async (tx) => {
		await tx.execute(
			sql`select pg_advisory_xact_lock(hashtextextended(${`billing-sync:${organizationId}`}, 0))`,
		);
		const previous =
			(await tx.query.subscriptions.findFirst({
				where: eq(subscriptions.stripeSubscriptionId, stripeSubscription.id),
			})) ??
			(isLatest
				? await tx.query.subscriptions.findFirst({
						where: and(
							eq(subscriptions.referenceId, organizationId),
							isNull(subscriptions.stripeSubscriptionId),
							eq(subscriptions.status, "incomplete"),
						),
						orderBy: desc(subscriptions.createdAt),
					})
				: undefined);
		if (!previous && !isLatest) return {};
		const values = {
			...subscriptionRowFromStripe(stripeSubscription),
			plan: planName ?? previous?.plan ?? "pro",
			referenceId: organizationId,
			updatedAt: new Date(),
		};
		if (previous) {
			const [row] = await tx
				.update(subscriptions)
				.set(values)
				.where(eq(subscriptions.id, previous.id))
				.returning();
			return { previous, row };
		}
		const [row] = await tx.insert(subscriptions).values(values).returning();
		return { row };
	});
}

/**
 * Brings an organization's `subscriptions` rows in line with Autumn and the
 * Stripe subscriptions Autumn manages, and sends the started and cancelled
 * notices the Stripe plugin used to send.
 */
export async function syncOrganizationSubscription(
	organizationId: string,
): Promise<void> {
	const org = await db.query.organizations.findFirst({
		where: eq(authSchema.organizations.id, organizationId),
		columns: { stripeCustomerId: true },
	});
	if (!org?.stripeCustomerId) return;

	const [planId, stripeSubscriptions] = await Promise.all([
		currentAutumnPlanId(organizationId),
		stripeClient.subscriptions.list({
			customer: org.stripeCustomerId,
			status: "all",
			limit: RECENT_STRIPE_SUBSCRIPTIONS,
		}),
	]);
	const planName = planId ? legacyPlanName(planId) : null;

	for (const [
		index,
		stripeSubscription,
	] of stripeSubscriptions.data.entries()) {
		const isLatest = index === 0;
		const { previous, row } = await writeRow(
			organizationId,
			stripeSubscription,
			isLatest ? planName : null,
			isLatest,
		);
		if (!row) continue;
		const transitions = subscriptionTransitions(previous, stripeSubscription);
		if (transitions.started) {
			await notifySubscriptionStarted({
				subscription: row,
				stripeSubscription,
				planName: row.plan,
			});
		}
		if (transitions.canceled) {
			await notifySubscriptionCanceled({
				subscription: row,
				stripeSubscription,
				cancellationDetails: stripeSubscription.cancellation_details,
			});
		}
	}
}
