import { db } from "@superset/db/client";
import {
	members,
	organizations,
	subscriptions,
	users,
} from "@superset/db/schema";
import { ACTIVE_SUBSCRIPTION_STATUSES } from "@superset/shared/billing";
import { Redis } from "@upstash/redis";
import { and, eq, isNull } from "drizzle-orm";
import { Resend } from "resend";
import Stripe from "stripe";
import { z } from "zod";
import { env } from "@/env";
import { verifyQstashRequest } from "@/lib/verifyQstash";
import { emitFeedbackOnce, isFeedbackEligible } from "./eligibility";

const stripe = new Stripe(env.STRIPE_SECRET_KEY);
const resend = new Resend(env.RESEND_API_KEY);
const redis = new Redis({
	url: env.KV_REST_API_URL,
	token: env.KV_REST_API_TOKEN,
});
const path = "/api/integrations/stripe/jobs/cancellation-feedback";
const payloadSchema = z.object({
	stripeSubscriptionId: z.string().min(1),
	canceledAt: z.number().int().positive(),
});

export async function POST(request: Request) {
	const body = await request.text();
	const rejected = await verifyQstashRequest(request, body, path);
	if (rejected) return rejected;
	let payload: z.infer<typeof payloadSchema>;
	try {
		payload = payloadSchema.parse(JSON.parse(body));
	} catch {
		return Response.json({ error: "Invalid payload" }, { status: 400 });
	}

	try {
		const subscription = await stripe.subscriptions.retrieve(
			payload.stripeSubscriptionId,
		);
		if (!isFeedbackEligible(subscription, payload.canceledAt)) {
			return Response.json({ skipped: "cancellation no longer eligible" });
		}
		if (
			!subscription.items.data.some(
				({ price }) =>
					price.id === env.STRIPE_PRO_MONTHLY_PRICE_ID ||
					price.id === env.STRIPE_PRO_YEARLY_PRICE_ID,
			)
		)
			return Response.json({ skipped: "not a Pro price" });
		const localSubscription = await db.query.subscriptions.findFirst({
			where: and(
				eq(subscriptions.stripeSubscriptionId, subscription.id),
				eq(subscriptions.plan, "pro"),
			),
		});
		if (!localSubscription) return Response.json({ skipped: "not Pro" });
		const customerId =
			typeof subscription.customer === "string"
				? subscription.customer
				: subscription.customer.id;
		const organization = await db.query.organizations.findFirst({
			where: and(
				eq(organizations.id, localSubscription.referenceId),
				eq(organizations.stripeCustomerId, customerId),
			),
		});
		if (!organization)
			return Response.json({ skipped: "organization missing" });
		for await (const other of stripe.subscriptions.list({
			customer: customerId,
			status: "all",
			limit: 100,
		})) {
			if (
				other.id !== subscription.id &&
				ACTIVE_SUBSCRIPTION_STATUSES.some((status) => status === other.status)
			) {
				return Response.json({ skipped: "resubscribed" });
			}
		}
		const recipients = await db
			.select({ id: users.id, email: users.email })
			.from(members)
			.innerJoin(users, eq(members.userId, users.id))
			.where(
				and(
					eq(members.organizationId, organization.id),
					eq(members.role, "owner"),
					isNull(users.deletionRequestedAt),
				),
			);
		let enrolled = 0;
		for (const recipient of recipients) {
			const contact = await resend.contacts.get({ email: recipient.email });
			if (contact.error?.name === "not_found") continue;
			if (contact.error) throw new Error(contact.error.message);
			if (!contact.data || contact.data.unsubscribed) continue;
			const sent = await emitFeedbackOnce({
				claim: () =>
					redis.set(
						`pro-cancellation-feedback:${subscription.id}:${recipient.id}`,
						"claimed",
						{ nx: true },
					),
				emit: async () => {
					const result = await resend.events.send({
						event: "pro.cancellation_feedback_due",
						contactId: contact.data.id,
					});
					if (result.error) throw new Error(result.error.message);
				},
			});
			if (sent) enrolled++;
		}
		return Response.json({ enrolled });
	} catch (error) {
		console.error(
			"[stripe/cancellation-feedback] Failed to process feedback:",
			error,
		);
		return Response.json(
			{ error: "Failed to process feedback" },
			{ status: 500 },
		);
	}
}
