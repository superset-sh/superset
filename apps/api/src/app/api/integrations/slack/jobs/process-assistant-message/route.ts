import { z } from "zod";
import { verifyQstashRequest } from "@/lib/verifyQstash";
import { processAssistantMessage } from "../../events/process-assistant-message";
import { isUnpostableChannelError } from "../../events/utils/slack-client";

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
		type: z.literal("message"),
		user: z.string(),
		text: z.string().optional(),
		ts: z.string(),
		channel: z.string(),
		channel_type: z.literal("im"),
		event_ts: z.string(),
		thread_ts: z.string().optional(),
		files: z.array(slackFileSchema).optional(),
	}),
	teamId: z.string(),
	eventId: z.string(),
});

export async function POST(request: Request) {
	const body = await request.text();
	const rejected = await verifyQstashRequest(
		request,
		body,
		"/api/integrations/slack/jobs/process-assistant-message",
	);
	if (rejected) return rejected;

	const parsed = payloadSchema.safeParse(JSON.parse(body));
	if (!parsed.success) {
		console.error(
			"[slack/process-assistant-message] Invalid payload:",
			parsed.error,
		);
		return Response.json({ error: "Invalid payload" }, { status: 400 });
	}

	try {
		await processAssistantMessage({
			event: parsed.data.event,
			teamId: parsed.data.teamId,
			eventId: parsed.data.eventId,
		});
	} catch (error) {
		// Replies to read-only/archived/unjoined channels can never be
		// delivered; a 500 would only make Slack redeliver the event.
		if (isUnpostableChannelError(error)) {
			console.warn(
				"[slack/process-assistant-message] channel cannot receive replies; dropping event",
				{ error: String(error) },
			);
			return Response.json({ success: true, status: "undeliverable" });
		}
		throw error;
	}

	return Response.json({ success: true });
}
