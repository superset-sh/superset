import { createHmac, randomInt, timingSafeEqual } from "node:crypto";
import { db } from "@superset/db/client";
import { dealRedemptions } from "@superset/db/schema";
import { YcDealCodeEmail } from "@superset/email/emails/billing/yc-deal-code";
import { and, eq } from "drizzle-orm";
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
	status: "code_sent" | "pending";
	promotionCode?: string;
};

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
			promotionCode: outcome.promotionCode ?? null,
			payload: rawPayload,
		})
		.onConflictDoNothing();

	return Response.json({ status: outcome.status });
}
