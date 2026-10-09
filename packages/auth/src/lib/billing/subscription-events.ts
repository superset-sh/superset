import { db } from "@superset/db/client";
import { githubInstallations } from "@superset/db/schema";
import * as authSchema from "@superset/db/schema/auth";
import { SubscriptionCancelledEmail } from "@superset/email/emails/billing/subscription-cancelled";
import { SubscriptionStartedEmail } from "@superset/email/emails/billing/subscription-started";
import { Client } from "@upstash/qstash";
import { eq } from "drizzle-orm";
import type Stripe from "stripe";
import { env } from "../../env";
import {
	formatPrice,
	getOrganizationBillingRecipients,
	getOrganizationOwners,
} from "../../utils/billing";
import { captureBillingEvent } from "../billing-analytics";
import { resend } from "../resend";

const qstash = new Client({ token: env.QSTASH_TOKEN });

export const NOTIFY_SLACK_URL = `${env.NEXT_PUBLIC_API_URL}/api/integrations/stripe/jobs/notify-slack`;

export interface SubscriptionEventRow {
	referenceId: string;
	plan: string;
	seats?: number | null;
	periodEnd?: Date | null;
}

/**
 * Backfills GitHub for a paying organization. Its deliveries are dropped at the
 * webhook while an org is on the free plan, so whatever changed in the gap is
 * missing until this job replays it.
 */
async function resumeGatedSyncs(organizationId: string): Promise<void> {
	const installation = await db.query.githubInstallations.findFirst({
		where: eq(githubInstallations.organizationId, organizationId),
		columns: { id: true },
	});
	if (!installation) return;

	try {
		await qstash.publishJSON({
			url: `${env.NEXT_PUBLIC_API_URL}/api/github/jobs/initial-sync`,
			body: { installationDbId: installation.id, organizationId },
			retries: 3,
		});
	} catch (error) {
		console.error(
			"[stripe/subscription-complete] Failed to queue integration backfill:",
			error,
		);
	}
}

export function serializeCancellationDetails(
	cancellationDetails?: Stripe.Subscription.CancellationDetails | null,
) {
	try {
		if (!cancellationDetails) return undefined;

		return {
			comment: cancellationDetails.comment,
			feedback: cancellationDetails.feedback,
			reason: cancellationDetails.reason,
		};
	} catch (error) {
		console.error(
			"[stripe/subscription-cancel] Failed to serialize cancellation details:",
			error,
		);
		return undefined;
	}
}

export async function notifySubscriptionStarted({
	subscription,
	stripeSubscription,
	planName,
}: {
	subscription: SubscriptionEventRow;
	stripeSubscription: Stripe.Subscription;
	planName: string;
}): Promise<void> {
	await resumeGatedSyncs(subscription.referenceId);

	const org = await db.query.organizations.findFirst({
		where: eq(authSchema.organizations.id, subscription.referenceId),
	});

	if (!org) return;

	if (planName === "enterprise") return;

	const owners = await getOrganizationOwners(subscription.referenceId);

	const interval = stripeSubscription.items.data[0]?.price?.recurring
		?.interval as "month" | "year" | undefined;
	const billingInterval = interval === "year" ? "yearly" : "monthly";

	const pricePerSeat =
		stripeSubscription.items.data[0]?.price?.unit_amount ?? 0;
	const currency = stripeSubscription.items.data[0]?.price?.currency ?? "usd";
	const amount = formatPrice(pricePerSeat, currency);

	await resend.batch.send(
		owners.map((owner) => ({
			from: "Superset <noreply@superset.sh>",
			to: owner.email,
			subject: `Welcome to Superset ${planName}!`,
			react: SubscriptionStartedEmail({
				ownerName: owner.name,
				organizationName: org.name,
				planName,
				billingInterval,
				amount,
				seatCount: subscription.seats ?? 1,
			}),
		})),
	);

	try {
		await qstash.publishJSON({
			url: NOTIFY_SLACK_URL,
			body: {
				eventType: "subscription_started",
				stripeSubscriptionId: stripeSubscription.id,
			},
			retries: 3,
		});
	} catch (error) {
		console.error(
			"[stripe/subscription-complete] Failed to queue Slack notification:",
			error,
		);
	}

	// The paid conversion. Emitted here rather than from an
	// `onEvent` case for `checkout.session.completed` because Better
	// Auth calls both for that one webhook, and this hook is the side
	// that already knows the plan, seat count and interval.
	await captureBillingEvent({
		event: "subscription_started",
		organizationId: subscription.referenceId,
		initiatedByUserId: stripeSubscription.metadata?.userId,
		// This hook is handed the subscription, not the webhook event, so
		// the subscription id is the stable key. One `subscription_started`
		// per subscription is the intended meaning anyway.
		idempotencyKey: stripeSubscription.id,
		occurredAt: new Date(stripeSubscription.created * 1000),
		properties: {
			plan: planName,
			billing_interval: billingInterval,
			seats: subscription.seats ?? 1,
			// Deliberately not `revenue`: that property is what PostHog
			// revenue analytics sums, and `payment_succeeded` below is the
			// one event where money actually moved. Naming it here too
			// would double-count every subscription.
			subscription_value: pricePerSeat * (subscription.seats ?? 1),
			currency,
			stripe_subscription_id: stripeSubscription.id,
		},
	});
}

export async function notifySubscriptionCanceled({
	subscription,
	stripeSubscription,
	cancellationDetails,
}: {
	subscription: SubscriptionEventRow;
	stripeSubscription: Stripe.Subscription;
	cancellationDetails?: Stripe.Subscription.CancellationDetails | null;
}): Promise<void> {
	const org = await db.query.organizations.findFirst({
		where: eq(authSchema.organizations.id, subscription.referenceId),
	});

	if (!org?.stripeCustomerId) return;

	const recipients = await getOrganizationBillingRecipients(
		subscription.referenceId,
	);
	const accessEndsAt = subscription.periodEnd ?? new Date();

	// periodEnd is the period Stripe was trying to bill for, so on a
	// collection failure it sits weeks in the future while access has
	// already stopped. Only a voluntary cancel keeps access until then.
	const dueToPaymentFailure =
		(cancellationDetails ?? stripeSubscription.cancellation_details)?.reason ===
		"payment_failed";

	if (
		subscription.plan === "pro" &&
		!dueToPaymentFailure &&
		stripeSubscription.canceled_at
	) {
		try {
			await qstash.publishJSON({
				url: `${env.NEXT_PUBLIC_API_URL}/api/integrations/stripe/jobs/cancellation-feedback`,
				body: {
					stripeSubscriptionId: stripeSubscription.id,
					canceledAt: stripeSubscription.canceled_at,
				},
				delay: 2700,
				retries: 3,
				deduplicationId: `pro-cancellation-feedback-${stripeSubscription.id}-${stripeSubscription.canceled_at}`,
			});
		} catch (error) {
			console.error(
				"[stripe/cancellation-feedback] Failed to queue feedback:",
				error,
			);
		}
	}

	await resend.batch.send(
		recipients.map((recipient) => ({
			from: "Superset <noreply@superset.sh>",
			to: recipient.email,
			subject: dueToPaymentFailure
				? `Your ${subscription.plan} subscription ended`
				: `Your ${subscription.plan} subscription has been cancelled`,
			react: SubscriptionCancelledEmail({
				recipientName: recipient.name,
				organizationName: org.name,
				planName: subscription.plan,
				accessEndsAt,
				dueToPaymentFailure,
			}),
		})),
	);

	try {
		await qstash.publishJSON({
			url: NOTIFY_SLACK_URL,
			body: {
				eventType: "subscription_cancelled",
				stripeSubscriptionId: stripeSubscription.id,
				cancellationDetails: serializeCancellationDetails(
					cancellationDetails ?? stripeSubscription.cancellation_details,
				),
			},
			retries: 3,
			// portal collects the cancellation survey after cancel confirms; give it time
			delay: 120,
		});
	} catch (error) {
		console.error(
			"[stripe/subscription-cancel] Failed to queue Slack notification:",
			error,
		);
	}
}
