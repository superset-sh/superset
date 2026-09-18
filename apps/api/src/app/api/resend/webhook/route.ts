import { z } from "zod";
import { env } from "@/env";
import { posthog } from "@/lib/analytics";
import { verifySvixSignature } from "./verify-signature";

const POSTHOG_EVENTS: Record<string, string> = {
	"email.sent": "email_sent",
	"email.delivered": "email_delivered",
	"email.clicked": "email_clicked",
	"email.bounced": "email_bounced",
	"email.complained": "email_complained",
	"contact.updated": "contact_updated",
};

const SUPPRESSION_EVENTS = new Set(["email.bounced", "email.complained"]);

const payloadSchema = z.object({
	type: z.string(),
	created_at: z.string().optional(),
	data: z.object({
		email_id: z.string().optional(),
		from: z.string().optional(),
		to: z.union([z.array(z.string()), z.string()]).optional(),
		subject: z.string().optional(),
		email: z.string().optional(),
		unsubscribed: z.boolean().optional(),
		tags: z
			.union([
				z.record(z.string(), z.string()),
				z.array(z.object({ name: z.string(), value: z.string() })),
			])
			.optional(),
		click: z.object({ link: z.string().optional() }).optional(),
		bounce: z
			.object({
				type: z.string().optional(),
				subType: z.string().optional(),
				message: z.string().optional(),
			})
			.optional(),
	}),
});

type WebhookData = z.infer<typeof payloadSchema>["data"];

function normalizeTags(tags: WebhookData["tags"]): Record<string, string> {
	if (!tags) {
		return {};
	}
	if (Array.isArray(tags)) {
		return Object.fromEntries(tags.map(({ name, value }) => [name, value]));
	}
	return tags;
}

export async function POST(request: Request) {
	const body = await request.text();
	const svixId = request.headers.get("svix-id");
	const svixTimestamp = request.headers.get("svix-timestamp");
	const svixSignature = request.headers.get("svix-signature");

	if (!svixId || !svixTimestamp || !svixSignature) {
		return Response.json(
			{ error: "Missing signature headers" },
			{ status: 401 },
		);
	}

	const verified = verifySvixSignature({
		secret: env.RESEND_WEBHOOK_SECRET,
		id: svixId,
		timestamp: svixTimestamp,
		signature: svixSignature,
		payload: body,
	});
	if (!verified) {
		console.error("[resend/webhook] Signature verification failed");
		return Response.json({ error: "Invalid signature" }, { status: 401 });
	}

	let json: unknown;
	try {
		json = JSON.parse(body);
	} catch {
		return Response.json({ error: "Invalid JSON payload" }, { status: 400 });
	}

	const parsed = payloadSchema.safeParse(json);
	if (!parsed.success) {
		console.error("[resend/webhook] Unexpected payload:", parsed.error.message);
		return Response.json({ error: "Unexpected payload" }, { status: 400 });
	}

	const { type, data } = parsed.data;
	const event = POSTHOG_EVENTS[type];
	if (!event) {
		return Response.json({ received: true, ignored: type });
	}

	const recipient =
		type === "contact.updated"
			? data.email
			: Array.isArray(data.to)
				? data.to[0]
				: data.to;
	if (!recipient) {
		console.warn("[resend/webhook] No recipient on event:", type);
		return Response.json({ received: true });
	}

	const suppressRecipient =
		SUPPRESSION_EVENTS.has(type) || data.unsubscribed === true;

	posthog.capture({
		distinctId: recipient,
		event,
		properties: {
			...normalizeTags(data.tags),
			subject: data.subject,
			from: data.from,
			resend_email_id: data.email_id,
			...(data.click?.link && { link: data.click.link }),
			...(data.bounce && {
				bounce_type: data.bounce.type,
				bounce_sub_type: data.bounce.subType,
				bounce_message: data.bounce.message,
			}),
			...(data.unsubscribed !== undefined && {
				unsubscribed: data.unsubscribed,
			}),
			...(suppressRecipient && { suppress_recipient: true }),
		},
	});
	await posthog.flush();

	return Response.json({ received: true });
}
