import { db, dbWs } from "@superset/db/client";
import { subscriptions } from "@superset/db/schema";
import * as authSchema from "@superset/db/schema/auth";
import { and, desc, eq, isNull, sql } from "drizzle-orm";
import type Stripe from "stripe";
import { autumnClient } from "../../autumn";
import { env } from "../../env";
import { stripeClient } from "../../stripe";
import {
	isPaidAutumnPlan,
	legacyPlanName,
	planFromStripePrice,
	SEATS_FEATURE_ID,
} from "./plans";
import {
	notifySubscriptionCanceled,
	notifySubscriptionStarted,
} from "./subscription-events";
import {
	seatItem,
	subscriptionRowFromStripe,
	subscriptionTransitions,
} from "./subscription-row";

const RECENT_STRIPE_SUBSCRIPTIONS = 10;

function requireAutumn() {
	if (!autumnClient) throw new Error("AUTUMN_SECRET_KEY is not set");
	return autumnClient;
}

async function saveStripeCustomerId(
	organizationId: string,
	stripeCustomerId: string | null | undefined,
): Promise<string | null> {
	if (!stripeCustomerId) return null;
	await db
		.update(authSchema.organizations)
		.set({ stripeCustomerId })
		.where(
			and(
				eq(authSchema.organizations.id, organizationId),
				isNull(authSchema.organizations.stripeCustomerId),
			),
		);
	return stripeCustomerId;
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
	if (!org.stripeCustomerId) {
		await saveStripeCustomerId(org.id, customer.stripeId);
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
): Promise<boolean> {
	const planId = await currentAutumnPlanId(organizationId);
	if (!planId) {
		console.error(
			`[billing/seats] ${organizationId} has no paid Autumn plan; seats not set through Autumn`,
		);
		return false;
	}
	await requireAutumn().billing.update({
		customerId: organizationId,
		planId,
		featureQuantities: [{ featureId: SEATS_FEATURE_ID, quantity }],
	});
	return true;
}

type SubscriptionRow = typeof subscriptions.$inferSelect;
type Transaction = Parameters<Parameters<typeof dbWs.transaction>[0]>[0];

const STRIPE_PRICES = {
	pro: [env.STRIPE_PRO_MONTHLY_PRICE_ID, env.STRIPE_PRO_YEARLY_PRICE_ID],
	enterprise: [env.STRIPE_ENTERPRISE_YEARLY_PRICE_ID],
};

function holdsSeats(stripeSubscription: Stripe.Subscription): boolean {
	return stripeSubscription.items.data.some(
		(item) => item.price?.recurring?.usage_type !== "metered",
	);
}

async function writeRow(
	tx: Transaction,
	args: {
		organizationId: string;
		stripeSubscription: Stripe.Subscription;
		autumnPlanName: string | null;
		isLatest: boolean;
	},
): Promise<{ previous?: SubscriptionRow; row?: SubscriptionRow }> {
	const { organizationId, stripeSubscription, isLatest } = args;
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
	const plan =
		planFromStripePrice(
			seatItem(stripeSubscription)?.price.id,
			STRIPE_PRICES,
		) ??
		(isLatest ? args.autumnPlanName : null) ??
		previous?.plan ??
		"pro";
	const values = {
		...subscriptionRowFromStripe(stripeSubscription),
		plan,
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
}

async function resolveStripeCustomerId(
	organizationId: string,
): Promise<string | null> {
	const org = await db.query.organizations.findFirst({
		where: eq(authSchema.organizations.id, organizationId),
		columns: { stripeCustomerId: true },
	});
	if (org?.stripeCustomerId) return org.stripeCustomerId;
	if (!autumnClient) return null;
	const customer = await autumnClient.customers.get({
		customerId: organizationId,
	});
	return saveStripeCustomerId(organizationId, customer.stripeId);
}

export async function syncOrganizationSubscription(
	organizationId: string,
): Promise<void> {
	const stripeCustomerId = await resolveStripeCustomerId(organizationId);
	if (!stripeCustomerId) return;

	const changes = await dbWs.transaction(async (tx) => {
		await tx.execute(
			sql`select pg_advisory_xact_lock(hashtextextended(${`billing-sync:${organizationId}`}, 0))`,
		);
		const [planId, listed] = await Promise.all([
			autumnClient
				? currentAutumnPlanId(organizationId).catch((error) => {
						console.error(
							`[billing/sync] ${organizationId} Autumn plan lookup failed`,
							error,
						);
						return null;
					})
				: null,
			stripeClient.subscriptions.list({
				customer: stripeCustomerId,
				status: "all",
				limit: RECENT_STRIPE_SUBSCRIPTIONS,
			}),
		]);
		const autumnPlanName = planId ? legacyPlanName(planId) : null;
		const seatSubscriptions = listed.data.filter(holdsSeats);
		const written = [];
		for (const [index, stripeSubscription] of seatSubscriptions.entries()) {
			const { previous, row } = await writeRow(tx, {
				organizationId,
				stripeSubscription,
				autumnPlanName,
				isLatest: index === 0,
			});
			if (row) written.push({ previous, row, stripeSubscription });
		}
		return written;
	});

	for (const { previous, row, stripeSubscription } of changes) {
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

export async function syncFromStripeEvent(event: Stripe.Event): Promise<void> {
	const object = event.data.object as { customer?: string | { id: string } };
	const customerId =
		typeof object.customer === "string" ? object.customer : object.customer?.id;
	if (!customerId) return;
	const org = await db.query.organizations.findFirst({
		where: eq(authSchema.organizations.stripeCustomerId, customerId),
		columns: { id: true },
	});
	if (org) await syncOrganizationSubscription(org.id);
}
