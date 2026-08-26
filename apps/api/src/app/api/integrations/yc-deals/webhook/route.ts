import { createHmac, randomInt, timingSafeEqual } from "node:crypto";
import { db } from "@superset/db/client";
import {
	dealRedemptions,
	members,
	organizations,
	subscriptions,
	users,
} from "@superset/db/schema";
import { YcDealCodeEmail } from "@superset/email/emails/billing/yc-deal-code";
import { ACTIVE_SUBSCRIPTION_STATUSES } from "@superset/shared/billing";
import { and, eq, inArray, sql } from "drizzle-orm";
import { Resend } from "resend";
import Stripe from "stripe";
import { z } from "zod";

import { env } from "@/env";

const SOURCE = "yc-bookface";

const stripeClient = new Stripe(env.STRIPE_SECRET_KEY);
const resend = new Resend(env.RESEND_API_KEY);

const companySchema = z.looseObject({
	name: z.string().nullish(),
	batch: z.string().nullish(),
});

const payloadSchema = z.looseObject({
	id: z.number(),
	deal_id: z.number(),
	email: z.string().nullish(),
	first_name: z.string().nullish(),
	last_name: z.string().nullish(),
	companies: z.array(companySchema).nullish(),
});

type Payload = z.infer<typeof payloadSchema>;

function verifySignature(body: string, signature: string | null): boolean {
	if (!env.YC_DEALS_WEBHOOK_SECRET || !signature) return false;
	const expected = createHmac("sha256", env.YC_DEALS_WEBHOOK_SECRET)
		.update(body)
		.digest("hex");
	const a = Buffer.from(expected);
	const b = Buffer.from(signature);
	return a.length === b.length && timingSafeEqual(a, b);
}

// No ambiguous characters (0/O, 1/I/L) so the code survives being read aloud.
const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

function generateCode(): string {
	let suffix = "";
	for (let i = 0; i < 8; i++) {
		suffix += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
	}
	return `YC-${suffix}`;
}

type Outcome = {
	status: "granted" | "code_sent" | "pending";
	organizationId?: string;
	stripeSubscriptionId?: string;
	promotionCode?: string;
};

/**
 * Rejecting the redemption makes Bookface show `message` to the founder and
 * not count the redemption, so they can retry after fixing the problem.
 */
class RejectRedemption extends Error {
	constructor(
		message: string,
		readonly httpStatus: number,
	) {
		super(message);
	}
}

async function grantSubscription(
	organizationId: string,
	payload: Payload,
): Promise<Outcome> {
	const org = await db.query.organizations.findFirst({
		where: eq(organizations.id, organizationId),
	});
	if (!org) throw new Error(`Organization ${organizationId} not found`);

	let customerId = org.stripeCustomerId;
	if (!customerId) {
		const customer = await stripeClient.customers.create({
			name: org.name,
			email: payload.email ?? undefined,
			metadata: { organizationId: org.id, organizationSlug: org.slug ?? "" },
		});
		customerId = customer.id;
		await db
			.update(organizations)
			.set({ stripeCustomerId: customerId })
			.where(eq(organizations.id, org.id));
	}

	const seatCount = await db.$count(
		members,
		eq(members.organizationId, org.id),
	);

	const subscription = await stripeClient.subscriptions.create({
		customer: customerId,
		items: [
			{
				price: env.STRIPE_PRO_MONTHLY_PRICE_ID,
				quantity: Math.max(seatCount, 1),
			},
		],
		discounts: [{ coupon: env.YC_BOOKFACE_COUPON_ID }],
		metadata: {
			source: SOURCE,
			organizationId: org.id,
			ycRedemptionId: String(payload.id),
		},
	});

	// The better-auth Stripe plugin's customer.subscription.created handler
	// cannot resolve an org from a customer id (it only does that when the
	// plugin is configured with `organization.enabled`, which we don't set), so
	// a subscription created through the API never reaches our table. Write the
	// row here. Later updates and cancels do reconcile through the plugin,
	// which finds this row by stripeSubscriptionId.
	const item = subscription.items.data[0];
	await db.insert(subscriptions).values({
		plan: "pro",
		referenceId: org.id,
		stripeCustomerId: customerId,
		stripeSubscriptionId: subscription.id,
		status: subscription.status,
		periodStart: item ? new Date(item.current_period_start * 1000) : null,
		periodEnd: item ? new Date(item.current_period_end * 1000) : null,
		seats: item?.quantity ?? Math.max(seatCount, 1),
		billingInterval: item?.price.recurring?.interval ?? "month",
	});

	return {
		status: "granted",
		organizationId: org.id,
		stripeSubscriptionId: subscription.id,
	};
}

async function sendCode(email: string, payload: Payload): Promise<Outcome> {
	const promotionCode = await stripeClient.promotionCodes.create({
		promotion: { type: "coupon", coupon: env.YC_BOOKFACE_COUPON_ID },
		code: generateCode(),
		max_redemptions: 1,
		metadata: {
			source: SOURCE,
			ycRedemptionId: String(payload.id),
			email,
		},
	});

	const { error } = await resend.emails.send({
		from: "Superset <noreply@superset.sh>",
		replyTo: "kiet@superset.sh",
		to: email,
		subject: "Your Superset YC deal code",
		react: YcDealCodeEmail({
			firstName: payload.first_name,
			code: promotionCode.code,
		}),
	});
	if (error) {
		throw new Error(`Failed to email promotion code: ${error.message}`);
	}

	return { status: "code_sent", promotionCode: promotionCode.code };
}

async function resolveOutcome(payload: Payload): Promise<Outcome> {
	const email = payload.email?.trim().toLowerCase();
	if (!email) return { status: "pending" };

	const user = await db.query.users.findFirst({
		where: sql`lower(${users.email}) = ${email}`,
	});

	if (user) {
		const ownerships = await db.query.members.findMany({
			where: and(eq(members.userId, user.id), eq(members.role, "owner")),
		});
		const orgIds = ownerships.map((m) => m.organizationId);

		if (orgIds.length > 0) {
			const activeSubs = await db.query.subscriptions.findMany({
				where: and(
					inArray(subscriptions.referenceId, orgIds),
					inArray(subscriptions.status, ACTIVE_SUBSCRIPTION_STATUSES),
				),
			});
			const subscribed = new Set(activeSubs.map((s) => s.referenceId));
			const eligible = orgIds.filter((id) => !subscribed.has(id));

			if (eligible.length === 1 && eligible[0]) {
				return grantSubscription(eligible[0], payload);
			}
			if (eligible.length === 0) {
				throw new RejectRedemption(
					"Looks like your org is already on a paid plan. Email kiet@superset.sh and we'll apply the 6 free months.",
					409,
				);
			}
			// More than one eligible org: we can't pick for them, so fall
			// through to the code path and let them redeem on the right org.
		}
	}

	return sendCode(email, payload);
}

export async function POST(request: Request) {
	if (!env.YC_DEALS_WEBHOOK_SECRET) {
		return Response.json({ error: "Not configured" }, { status: 503 });
	}

	const body = await request.text();
	if (!verifySignature(body, request.headers.get("x-yc-signature"))) {
		return Response.json({ error: "Invalid signature" }, { status: 401 });
	}

	let rawPayload: unknown;
	try {
		rawPayload = JSON.parse(body);
	} catch {
		return Response.json({ error: "Invalid JSON payload" }, { status: 400 });
	}

	const parsed = payloadSchema.safeParse(rawPayload);
	if (!parsed.success) {
		console.error("[yc-deals/webhook] Invalid payload:", parsed.error);
		return Response.json({ error: "Invalid payload" }, { status: 400 });
	}
	const payload = parsed.data;

	if (payload.deal_id !== env.YC_BOOKFACE_DEAL_ID) {
		return Response.json({ error: "Unknown deal" }, { status: 400 });
	}

	const externalRedemptionId = String(payload.id);
	const existing = await db.query.dealRedemptions.findFirst({
		where: and(
			eq(dealRedemptions.source, SOURCE),
			eq(dealRedemptions.externalRedemptionId, externalRedemptionId),
		),
	});
	if (existing) {
		// Retry of a delivery we already processed.
		return Response.json({ status: existing.status });
	}

	let outcome: Outcome;
	try {
		outcome = await resolveOutcome(payload);
	} catch (error) {
		if (error instanceof RejectRedemption) {
			return Response.json(
				{ message: error.message },
				{ status: error.httpStatus },
			);
		}
		console.error(
			`[yc-deals/webhook] Failed to process redemption ${externalRedemptionId}:`,
			error,
		);
		return Response.json({ error: "Processing failed" }, { status: 500 });
	}

	const company = payload.companies?.[0];
	const name =
		[payload.first_name, payload.last_name].filter(Boolean).join(" ") || null;

	await db
		.insert(dealRedemptions)
		.values({
			source: SOURCE,
			externalRedemptionId,
			dealId: payload.deal_id,
			email: payload.email?.trim().toLowerCase() ?? null,
			name,
			companyName: company?.name ?? null,
			companyBatch: company?.batch ?? null,
			status: outcome.status,
			organizationId: outcome.organizationId ?? null,
			stripeSubscriptionId: outcome.stripeSubscriptionId ?? null,
			promotionCode: outcome.promotionCode ?? null,
			payload: rawPayload,
		})
		.onConflictDoNothing();

	return Response.json({ status: outcome.status });
}
