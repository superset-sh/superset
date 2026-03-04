import { db } from "@superset/db/client";
import { subscriptions } from "@superset/db/schema";
import * as authSchema from "@superset/db/schema/auth";
import { Receiver } from "@upstash/qstash";
import { eq } from "drizzle-orm";
import Stripe from "stripe";
import { z } from "zod";

import { env } from "@/env";

import {
	type EnrichedSubscription,
	formatPaymentFailed,
	formatPaymentSucceeded,
	formatPlanChanged,
	formatSeatAdded,
	formatSeatRemoved,
	formatSubscriptionCancelled,
	formatSubscriptionStarted,
	getDiscountInfo,
} from "./slack-blocks";

// --- QStash verification ---

const receiver = new Receiver({
	currentSigningKey: env.QSTASH_CURRENT_SIGNING_KEY,
	nextSigningKey: env.QSTASH_NEXT_SIGNING_KEY,
});

// --- Stripe client ---

const stripeClient = new Stripe(env.STRIPE_SECRET_KEY);

// --- Payload schemas ---

const basePayload = z.object({
	stripeSubscriptionId: z.string(),
});

const payloadSchema = z.discriminatedUnion("eventType", [
	basePayload.extend({ eventType: z.literal("subscription_started") }),
	basePayload.extend({ eventType: z.literal("subscription_cancelled") }),
	basePayload.extend({
		eventType: z.literal("seat_added"),
		memberName: z.string(),
		previousSeats: z.number(),
		newSeats: z.number(),
	}),
	basePayload.extend({
		eventType: z.literal("seat_removed"),
		memberName: z.string(),
		previousSeats: z.number(),
		newSeats: z.number(),
	}),
	basePayload.extend({
		eventType: z.literal("payment_failed"),
		amountCents: z.number(),
		currency: z.string(),
	}),
	basePayload.extend({
		eventType: z.literal("payment_succeeded"),
		amountCents: z.number(),
		currency: z.string(),
		periodStart: z.number(),
		periodEnd: z.number(),
	}),
	basePayload.extend({
		eventType: z.literal("plan_changed"),
		previousInterval: z.string().optional(),
	}),
]);

// --- Enrichment ---

async function enrichFromSubscription(
	stripeSubscriptionId: string,
): Promise<EnrichedSubscription | null> {
	const stripeSub = await stripeClient.subscriptions.retrieve(
		stripeSubscriptionId,
		{ expand: ["discounts.source.coupon"] },
	);

	const customerId =
		typeof stripeSub.customer === "string"
			? stripeSub.customer
			: stripeSub.customer?.id;

	if (!customerId) return null;

	const org = await db.query.organizations.findFirst({
		where: eq(authSchema.organizations.stripeCustomerId, customerId),
	});

	if (!org) return null;

	const dbSub = await db.query.subscriptions.findFirst({
		where: eq(subscriptions.stripeSubscriptionId, stripeSubscriptionId),
	});

	const price = stripeSub.items.data[0]?.price;
	const interval = price?.recurring?.interval === "year" ? "yearly" : "monthly";

	return {
		organizationName: org.name,
		planName: dbSub?.plan ?? "Pro",
		stripeCustomerId: customerId,
		stripeSubscriptionId,
		seatCount: stripeSub.items.data[0]?.quantity ?? 1,
		pricePerSeatCents: price?.unit_amount ?? 0,
		currency: price?.currency ?? "usd",
		interval,
		discount: getDiscountInfo(stripeSub),
		accessEndsAt: dbSub?.periodEnd ?? null,
	};
}

// --- Route handler ---

export async function POST(request: Request) {
	const body = await request.text();
	const signature = request.headers.get("upstash-signature");

	if (!signature) {
		return Response.json({ error: "Missing signature" }, { status: 401 });
	}

	const isValid = await receiver.verify({
		body,
		signature,
		url: `${env.NEXT_PUBLIC_API_URL}/api/integrations/stripe/jobs/notify-slack`,
	});

	if (!isValid) {
		return Response.json({ error: "Invalid signature" }, { status: 401 });
	}

	const parsed = payloadSchema.safeParse(JSON.parse(body));
	if (!parsed.success) {
		console.error("[stripe/notify-slack] Invalid payload:", parsed.error);
		return Response.json({ error: "Invalid payload" }, { status: 400 });
	}

	const payload = parsed.data;

	const enriched = await enrichFromSubscription(payload.stripeSubscriptionId);
	if (!enriched) {
		console.error(
			`[stripe/notify-slack] Could not enrich subscription ${payload.stripeSubscriptionId}`,
		);
		return Response.json({ error: "Subscription not found" }, { status: 404 });
	}

	let blocks: unknown[];

	switch (payload.eventType) {
		case "subscription_started":
			blocks = formatSubscriptionStarted(enriched);
			break;
		case "subscription_cancelled":
			blocks = formatSubscriptionCancelled(enriched);
			break;
		case "seat_added":
			blocks = formatSeatAdded(
				enriched,
				payload.memberName,
				payload.previousSeats,
				payload.newSeats,
			);
			break;
		case "seat_removed":
			blocks = formatSeatRemoved(
				enriched,
				payload.memberName,
				payload.previousSeats,
				payload.newSeats,
			);
			break;
		case "payment_failed":
			blocks = formatPaymentFailed(enriched, payload.amountCents);
			break;
		case "payment_succeeded":
			blocks = formatPaymentSucceeded(
				enriched,
				payload.amountCents,
				payload.periodStart,
				payload.periodEnd,
			);
			break;
		case "plan_changed":
			blocks = formatPlanChanged(enriched, payload.previousInterval);
			break;
	}

	const response = await fetch(env.SLACK_BILLING_WEBHOOK_URL, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ blocks }),
	});

	if (!response.ok) {
		console.error(
			`[stripe/notify-slack] Slack webhook failed for ${payload.eventType}:`,
			response.status,
			await response.text(),
		);
		return Response.json({ error: "Slack webhook failed" }, { status: 500 });
	}

	return Response.json({ success: true });
}
