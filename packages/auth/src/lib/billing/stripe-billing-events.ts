import { db } from "@superset/db/client";
import { subscriptions } from "@superset/db/schema";
import * as authSchema from "@superset/db/schema/auth";
import { PaymentFailedEmail } from "@superset/email/emails/billing/payment-failed";
import { RenewalUpcomingEmail } from "@superset/email/emails/billing/renewal-upcoming";
import { NOREPLY_FROM } from "@superset/email/sender";
import { Client } from "@upstash/qstash";
import { eq } from "drizzle-orm";
import type Stripe from "stripe";
import { env } from "../../env";
import { stripeClient } from "../../stripe";
import {
	formatPrice,
	getOrganizationBillingRecipients,
} from "../../utils/billing";
import { captureBillingEvent } from "../billing-analytics";
import { resend } from "../resend";
import { organizationForStripeCustomer } from "./autumn/customer";
import { NOTIFY_SLACK_URL } from "./subscription-events";

const qstash = new Client({ token: env.QSTASH_TOKEN });

/**
 * Stripe is the authority here, not our `subscriptions` row: the row is keyed
 * by organization, so an organization that resubscribed has more than one and
 * the wrong status can win. On a read failure this answers `false`, which
 * sends the mail — a duplicate notice beats swallowing a real one.
 */
async function isStripeSubscriptionCancelled(stripeSubscriptionId: string) {
	try {
		const stripeSubscription =
			await stripeClient.subscriptions.retrieve(stripeSubscriptionId);
		return stripeSubscription.status === "canceled";
	} catch (error) {
		console.error(
			"[stripe/payment-failed] Failed to read subscription status:",
			error,
		);
		return false;
	}
}

/**
 * Dunning and revenue notices from Stripe's own invoice and checkout events:
 * payment-failed and renewal emails, Slack, and PostHog. Autumn does not send
 * these, so they stay on Stripe in both billing modes.
 */
export async function handleStripeBillingEvent(
	event: Stripe.Event,
): Promise<void> {
	if (event.type === "invoice.payment_failed") {
		const invoice = event.data.object as Stripe.Invoice;

		const customerId =
			typeof invoice.customer === "string"
				? invoice.customer
				: invoice.customer?.id;

		if (!customerId) return;

		const org = await db.query.organizations.findFirst({
			where: eq(authSchema.organizations.stripeCustomerId, customerId),
		});

		if (!org?.stripeCustomerId) return;

		const subscription = await db.query.subscriptions.findFirst({
			where: eq(subscriptions.referenceId, org.id),
		});

		// The invoice names the subscription this event is about, so it
		// wins. The organization-level row is only a fallback: the lookup
		// above is unordered and an organization that resubscribed has
		// several, so preferring it can check — or notify Slack about —
		// a subscription that has nothing to do with this invoice.
		const stripeSubId =
			(invoice.parent?.subscription_details?.subscription as
				| string
				| undefined) ?? subscription?.stripeSubscriptionId;

		const isFinalAttempt = invoice.next_payment_attempt == null;
		const isFirstAttempt = (invoice.attempt_count ?? 0) <= 1;

		// Stripe keeps retrying the closing invoice after someone cancels,
		// so this still fires for subscriptions that are already gone.
		// Warning them they are about to lose access would be false, and
		// nagging someone who already left is worse than saying nothing.
		const alreadyCancelled = stripeSubId
			? await isStripeSubscriptionCancelled(stripeSubId)
			: false;

		// Stripe fires this on every retry. Mailing all of them trains
		// people to ignore the one that matters, so only the opening
		// notice and the last-chance notice go out.
		if (!alreadyCancelled && (isFirstAttempt || isFinalAttempt)) {
			const recipients = await getOrganizationBillingRecipients(org.id);
			const amount = formatPrice(invoice.amount_due, invoice.currency);
			const nextRetryDate = invoice.next_payment_attempt
				? new Date(invoice.next_payment_attempt * 1000)
				: null;

			await resend.batch.send(
				recipients.map((recipient) => ({
					from: NOREPLY_FROM,
					to: recipient.email,
					subject: isFinalAttempt
						? `Final notice: payment failed for ${org.name}`
						: `Payment failed for ${org.name}`,
					react: PaymentFailedEmail({
						recipientName: recipient.name,
						organizationName: org.name,
						planName: subscription?.plan ?? "Pro",
						amount,
						nextRetryDate,
						// Anyone holding the link can settle a hosted invoice,
						// so every billing recipient gets it. The old
						// owners-only gate existed because this used to be a
						// billing portal session, which needs ownership.
						payInvoiceUrl: invoice.hosted_invoice_url ?? undefined,
					}),
				})),
			);
		}

		if (stripeSubId) {
			try {
				await qstash.publishJSON({
					url: NOTIFY_SLACK_URL,
					body: {
						eventType: "payment_failed",
						stripeSubscriptionId: stripeSubId,
						amountCents: invoice.amount_due,
						currency: invoice.currency,
					},
					retries: 3,
				});
			} catch (error) {
				console.error(
					"[stripe/payment-failed] Failed to queue Slack notification:",
					error,
				);
			}
		}

		await captureBillingEvent({
			event: "payment_failed",
			organizationId: org.id,
			initiatedByUserId: invoice.parent?.subscription_details?.metadata?.userId,
			idempotencyKey: event.id,
			occurredAt: new Date(event.created * 1000),
			properties: {
				// No money moved, so this must not be `revenue`.
				amount_due: invoice.amount_due,
				currency: invoice.currency,
				attempt_count: invoice.attempt_count ?? 0,
				is_final_attempt: isFinalAttempt,
				already_cancelled: alreadyCancelled,
				stripe_subscription_id: stripeSubId ?? null,
			},
		});
	}

	if (event.type === "invoice.upcoming") {
		const invoice = event.data.object as Stripe.Invoice;

		const customerId =
			typeof invoice.customer === "string"
				? invoice.customer
				: invoice.customer?.id;

		if (!customerId) return;

		const stripeSubId = invoice.parent?.subscription_details?.subscription as
			| string
			| undefined;

		if (!stripeSubId) return;

		// Matched on the Stripe id, not the organization: an organization
		// that resubscribed has several rows and the wrong one can win.
		const subscription = await db.query.subscriptions.findFirst({
			where: eq(subscriptions.stripeSubscriptionId, stripeSubId),
		});

		// Annual only — see RenewalUpcomingEmail for why monthly plans and
		// seat changes are deliberately left out.
		if (subscription?.billingInterval !== "year") return;

		const renewsAtSeconds = invoice.next_payment_attempt ?? invoice.period_end;

		if (!renewsAtSeconds) return;

		const org = await db.query.organizations.findFirst({
			where: eq(authSchema.organizations.stripeCustomerId, customerId),
		});

		if (!org) return;

		const recipients = await getOrganizationBillingRecipients(org.id);
		// Max, not sum: a proration line carries its own quantity and
		// adding them together reports more seats than exist.
		const seatCount = invoice.lines.data.reduce(
			(largest, line) => Math.max(largest, line.quantity ?? 0),
			0,
		);

		await resend.batch.send(
			recipients.map((recipient) => ({
				from: NOREPLY_FROM,
				to: recipient.email,
				subject: `${org.name}'s ${subscription.plan} plan renews soon`,
				react: RenewalUpcomingEmail({
					recipientName: recipient.name,
					organizationName: org.name,
					planName: subscription.plan,
					amount: formatPrice(invoice.amount_due, invoice.currency),
					renewsAt: new Date(renewsAtSeconds * 1000),
					seatCount: Math.max(1, seatCount),
					isOwner: recipient.role === "owner",
				}),
			})),
		);
	}

	if (event.type === "invoice.paid") {
		const invoice = event.data.object as Stripe.Invoice;

		const subscriptionDetails =
			invoice.parent?.subscription_details ?? undefined;
		const stripeSubId = subscriptionDetails?.subscription as string | undefined;

		if (stripeSubId) {
			try {
				await qstash.publishJSON({
					url: NOTIFY_SLACK_URL,
					body: {
						eventType: "payment_succeeded",
						stripeSubscriptionId: stripeSubId,
						amountCents: invoice.amount_paid,
						currency: invoice.currency,
						periodStart: invoice.period_start ?? 0,
						periodEnd: invoice.period_end ?? 0,
					},
					retries: 3,
				});
			} catch (error) {
				console.error(
					"[stripe/payment-succeeded] Failed to queue Slack notification:",
					error,
				);
			}
		}

		// `referenceId` is the organization id when Better Auth created the
		// subscription; subscriptions Autumn creates carry none, so those are
		// found through the Stripe customer.
		const invoiceCustomerId =
			typeof invoice.customer === "string"
				? invoice.customer
				: invoice.customer?.id;
		const organizationId =
			subscriptionDetails?.metadata?.referenceId ??
			(invoiceCustomerId
				? await organizationForStripeCustomer(
						invoiceCustomerId,
						subscriptionDetails?.metadata,
					)
				: null);

		if (organizationId) {
			await captureBillingEvent({
				event: "payment_succeeded",
				organizationId,
				initiatedByUserId: subscriptionDetails?.metadata?.userId,
				idempotencyKey: event.id,
				occurredAt: new Date(event.created * 1000),
				properties: {
					revenue: invoice.amount_paid,
					currency: invoice.currency,
					// `subscription_create` is the first payment, everything
					// else is a renewal or a seat change.
					billing_reason: invoice.billing_reason,
					stripe_subscription_id: stripeSubId ?? null,
				},
			});
		}
	}

	// Stripe expires an unpaid Checkout session ~24h after it opens, so
	// this arrives late by design. It is the only signal that someone
	// reached the payment page and did not pay — the paid side comes
	// through `onSubscriptionComplete` instead.
	if (event.type === "checkout.session.expired") {
		const session = event.data.object as Stripe.Checkout.Session;
		const organizationId = session.metadata?.organizationId;

		if (organizationId) {
			await captureBillingEvent({
				event: "checkout_abandoned",
				organizationId,
				initiatedByUserId:
					session.metadata?.userId ?? session.metadata?.initiatedByUserId,
				idempotencyKey: event.id,
				occurredAt: new Date(event.created * 1000),
				properties: {
					// No money moved, so this must not be `revenue`.
					abandoned_value: session.amount_total ?? 0,
					currency: session.currency ?? "usd",
					stripe_session_id: session.id,
				},
			});
		}
	}

	if (event.type === "customer.subscription.updated") {
		const stripeSubscription = event.data.object as Stripe.Subscription;
		const previousAttributes = event.data.previous_attributes as
			| Partial<Stripe.Subscription>
			| undefined;

		const previousPriceId = previousAttributes?.items?.data?.[0]?.price?.id;
		const currentPriceId = stripeSubscription.items.data[0]?.price?.id;

		if (!previousPriceId || previousPriceId === currentPriceId) return;

		const previousInterval =
			previousAttributes?.items?.data?.[0]?.price?.recurring?.interval ===
			"year"
				? "yearly"
				: "monthly";

		try {
			await qstash.publishJSON({
				url: NOTIFY_SLACK_URL,
				body: {
					eventType: "plan_changed",
					stripeSubscriptionId: stripeSubscription.id,
					previousInterval,
				},
				retries: 3,
			});
		} catch (error) {
			console.error(
				"[stripe/plan-changed] Failed to queue Slack notification:",
				error,
			);
		}
	}
}
