import type { LinkSharedEvent, SlackEvent } from "@slack/types";
import { Client } from "@upstash/qstash";

import { env } from "@/env";
import { verifySlackSignature } from "../verify-signature";
import { processAppHomeOpened } from "./process-app-home-opened";
import { processEntityDetails } from "./process-entity-details";
import { processLinkShared } from "./process-link-shared";

const qstash = new Client({ token: env.QSTASH_TOKEN });

type SlackEventEnvelope = {
	type?: string;
	challenge?: string;
	team_id?: string;
	event_id?: string;
	event?: SlackEvent | null;
};

type SlackMessageEvent = {
	type: "message";
	channel_type?: string;
	bot_id?: string;
	subtype?: string;
	user?: string;
};

type EntityDetailsRequestedEvent = Extract<
	SlackEvent,
	{ type: "entity_details_requested" }
>;

export async function POST(request: Request) {
	const body = await request.text();
	const signature = request.headers.get("x-slack-signature");
	const timestamp = request.headers.get("x-slack-request-timestamp");

	if (!signature || !timestamp) {
		return Response.json(
			{ error: "Missing signature headers" },
			{ status: 401 },
		);
	}

	if (!verifySlackSignature({ body, signature, timestamp })) {
		console.error("[slack/events] Signature verification failed");
		return Response.json({ error: "Invalid signature" }, { status: 401 });
	}

	let payload: SlackEventEnvelope;
	try {
		const parsed = JSON.parse(body);
		if (parsed === null || typeof parsed !== "object") {
			console.error("[slack/events] Invalid JSON payload");
			return Response.json({ error: "Invalid JSON payload" }, { status: 400 });
		}
		payload = parsed as SlackEventEnvelope;
	} catch {
		console.error("[slack/events] Failed to parse JSON payload");
		return Response.json({ error: "Invalid JSON payload" }, { status: 400 });
	}

	// Slack sends this once when configuring the Events URL
	if (payload.type === "url_verification") {
		return Response.json({ challenge: payload.challenge });
	}

	if (payload.type === "event_callback") {
		const { event, team_id, event_id } = payload;
		if (
			!event ||
			typeof event.type !== "string" ||
			typeof team_id !== "string" ||
			typeof event_id !== "string"
		) {
			console.error("[slack/events] Invalid event payload shape");
			return Response.json({ error: "Invalid payload shape" }, { status: 400 });
		}

		if (event.type === "app_mention") {
			try {
				await qstash.publishJSON({
					url: `${env.NEXT_PUBLIC_API_URL}/api/integrations/slack/jobs/process-mention`,
					body: {
						event,
						teamId: team_id,
						eventId: event_id,
					},
					retries: 3,
				});
			} catch (error) {
				console.error("[slack/events] Failed to queue mention job:", error);
			}
		}

		if (event.type === "message") {
			const messageEvent = event as SlackMessageEvent;
			if (messageEvent.channel_type !== "im") {
				return new Response("ok", { status: 200 });
			}

			// Skip bot messages to prevent infinite loops
			if (
				messageEvent.bot_id ||
				messageEvent.subtype === "bot_message" ||
				!messageEvent.user
			) {
				return new Response("ok", { status: 200 });
			}

			try {
				await qstash.publishJSON({
					url: `${env.NEXT_PUBLIC_API_URL}/api/integrations/slack/jobs/process-assistant-message`,
					body: {
						event: messageEvent,
						teamId: team_id,
						eventId: event_id,
					},
					retries: 3,
				});
			} catch (error) {
				console.error(
					"[slack/events] Failed to queue assistant message job:",
					error,
				);
			}
		}

		if (event.type === "link_shared") {
			processLinkShared({
				event: event as LinkSharedEvent,
				teamId: team_id,
				eventId: event_id,
			}).catch((err: unknown) => {
				console.error("[slack/events] Process link shared error:", err);
			});
		}

		if (event.type === "entity_details_requested") {
			processEntityDetails({
				event: event as EntityDetailsRequestedEvent,
				teamId: team_id,
				eventId: event_id,
			}).catch((err: unknown) => {
				console.error("[slack/events] Process entity details error:", err);
			});
		}

		if (event.type === "app_home_opened") {
			const appHomeEvent = event as { user?: string; tab?: string };
			if (
				typeof appHomeEvent.user !== "string" ||
				typeof appHomeEvent.tab !== "string"
			) {
				console.error("[slack/events] Invalid app home opened payload shape");
				return new Response("ok", { status: 200 });
			}

			processAppHomeOpened({
				event: { user: appHomeEvent.user, tab: appHomeEvent.tab },
				teamId: team_id,
				eventId: event_id,
			}).catch((err: unknown) => {
				console.error("[slack/events] Process app home opened error:", err);
			});
		}
	}

	// Slack requires 200 within 3s regardless of event type
	return new Response("ok", { status: 200 });
}
