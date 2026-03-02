import { Receiver } from "@upstash/qstash";
import { z } from "zod";

import { env } from "@/env";

const receiver = new Receiver({
	currentSigningKey: env.QSTASH_CURRENT_SIGNING_KEY,
	nextSigningKey: env.QSTASH_NEXT_SIGNING_KEY,
});

const payloadSchema = z.object({
	eventType: z.enum([
		"subscription_started",
		"subscription_cancelled",
		"payment_failed",
		"payment_succeeded",
		"plan_changed",
	]),
	blocks: z.array(z.unknown()),
});

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

	const { eventType, blocks } = parsed.data;

	const response = await fetch(env.SLACK_BILLING_WEBHOOK_URL, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ blocks }),
	});

	if (!response.ok) {
		console.error(
			`[stripe/notify-slack] Slack webhook failed for ${eventType}:`,
			response.status,
			await response.text(),
		);
		return Response.json({ error: "Slack webhook failed" }, { status: 500 });
	}

	return Response.json({ success: true });
}
