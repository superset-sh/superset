import { z } from "zod";
import { verifyQstashRequest } from "@/lib/verifyQstash";
import { processSlackMention } from "../../events/process-mention";

import { isUnpostableChannelError } from "../../events/utils/slack-client";

export const maxDuration = 300;

const slackFileSchema = z.object({
	id: z.string(),
	name: z.string().optional(),
	mimetype: z.string().optional(),
	size: z.number().optional(),
	url_private: z.string().optional(),
	url_private_download: z.string().optional(),
});

const payloadSchema = z.object({
	event: z.object({
		type: z.enum(["app_mention", "message"]),
		channel_type: z.enum(["channel", "group", "mpim"]).optional(),
		user: z.string(),
		text: z.string().default(""),
		ts: z.string(),
		channel: z.string(),
		event_ts: z.string(),
		thread_ts: z.string().optional(),
		files: z.array(slackFileSchema).optional(),
		queued_ts: z.array(z.string()).optional(),
	}),
	teamId: z.string(),
	eventId: z.string(),
});

export async function POST(request: Request) {
	const body = await request.text();
	const rejected = await verifyQstashRequest(
		request,
		body,
		"/api/integrations/slack/jobs/process-mention",
	);
	if (rejected) return rejected;

	let payload: unknown;
	try {
		payload = JSON.parse(body);
	} catch {
		return Response.json({ error: "Invalid JSON payload" }, { status: 400 });
	}
	const parsed = payloadSchema.safeParse(payload);
	if (!parsed.success) {
		console.error("[slack/process-mention] Invalid payload:", parsed.error);
		return Response.json({ error: "Invalid payload" }, { status: 400 });
	}

	try {
		await processSlackMention(parsed.data);
	} catch (error) {
		if (isUnpostableChannelError(error)) {
			console.warn(
				"[slack/process-mention] channel cannot receive replies; dropping event",
				{ error: String(error) },
			);
			return Response.json({ success: true, status: "undeliverable" });
		}
		throw error;
	}

	return Response.json({ success: true });
}
