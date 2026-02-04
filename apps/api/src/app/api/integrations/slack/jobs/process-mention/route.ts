import { Receiver } from "@upstash/qstash";
import { z } from "zod";

import { env } from "@/env";
import { processSlackMention } from "../../events/process-mention";

const receiver = new Receiver({
	currentSigningKey: env.QSTASH_CURRENT_SIGNING_KEY,
	nextSigningKey: env.QSTASH_NEXT_SIGNING_KEY,
});

const payloadSchema = z.object({
	event: z.object({
		type: z.literal("app_mention"),
		user: z.string(),
		text: z.string(),
		ts: z.string(),
		channel: z.string(),
		event_ts: z.string(),
		thread_ts: z.string().optional(),
	}),
	teamId: z.string(),
	eventId: z.string(),
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
		url: `${env.NEXT_PUBLIC_API_URL}/api/integrations/slack/jobs/process-mention`,
	});

	if (!isValid) {
		return Response.json({ error: "Invalid signature" }, { status: 401 });
	}

	const parsed = payloadSchema.safeParse(JSON.parse(body));
	if (!parsed.success) {
		console.error("[slack/process-mention] Invalid payload:", parsed.error);
		return Response.json({ error: "Invalid payload" }, { status: 400 });
	}

	await processSlackMention(parsed.data);

	return Response.json({ success: true });
}
