import { createHmac, timingSafeEqual } from "node:crypto";
import { Client } from "@upstash/qstash";

import { env } from "@/env";
import { processAssistantMessage } from "./process-assistant-message";
import { processEntityDetails } from "./process-entity-details";
import { processLinkShared } from "./process-link-shared";
import { processSlackMention } from "./process-mention";

const qstash = new Client({ token: env.QSTASH_TOKEN });
const isDev = env.NODE_ENV === "development";

interface SlackChallenge {
	type: "url_verification";
	challenge: string;
	token: string;
}

interface SlackAppMentionEvent {
	type: "app_mention";
	user: string;
	text: string;
	ts: string;
	channel: string;
	event_ts: string;
	thread_ts?: string;
}

interface SlackMessageImEvent {
	type: "message";
	channel_type: "im";
	user?: string;
	text: string;
	ts: string;
	channel: string;
	event_ts: string;
	thread_ts?: string;
	bot_id?: string;
	subtype?: string;
}

interface SlackAssistantThreadStartedEvent {
	type: "assistant_thread_started";
	assistant_thread: {
		user_id: string;
		context: {
			channel_id: string;
			team_id: string;
			enterprise_id?: string;
		};
		channel_id: string;
		thread_ts: string;
	};
	event_ts: string;
}

interface SlackAssistantThreadContextChangedEvent {
	type: "assistant_thread_context_changed";
	assistant_thread: {
		user_id: string;
		context: {
			channel_id: string;
			team_id: string;
			enterprise_id?: string;
		};
		channel_id: string;
		thread_ts: string;
	};
	event_ts: string;
}

interface SlackLinkSharedEvent {
	type: "link_shared";
	user: string;
	channel: string;
	message_ts: string;
	unfurl_id: string;
	source: "conversations_history" | "composer";
	links: Array<{
		url: string;
		domain: string;
	}>;
	event_ts: string;
}

interface SlackEntityDetailsRequestedEvent {
	type: "entity_details_requested";
	user: string;
	channel: string;
	message_ts: string;
	thread_ts?: string;
	trigger_id: string;
	user_locale: string;
	entity_url: string;
	app_unfurl_url: string;
	external_ref: {
		id: string;
		type?: string;
	};
	event_ts: string;
}

type SlackEvent =
	| SlackAppMentionEvent
	| SlackMessageImEvent
	| SlackAssistantThreadStartedEvent
	| SlackAssistantThreadContextChangedEvent
	| SlackLinkSharedEvent
	| SlackEntityDetailsRequestedEvent;

interface SlackEventPayload {
	type: "event_callback";
	token: string;
	team_id: string;
	api_app_id: string;
	event: SlackEvent;
	event_id: string;
	event_time: number;
}

type SlackPayload = SlackChallenge | SlackEventPayload;

function verifySlackSignature({
	body,
	signature,
	timestamp,
}: {
	body: string;
	signature: string;
	timestamp: string;
}): boolean {
	// Check timestamp to prevent replay attacks (5 minute window)
	const timestampSec = Number.parseInt(timestamp, 10);
	const now = Math.floor(Date.now() / 1000);
	if (Math.abs(now - timestampSec) > 60 * 5) {
		console.error("[slack/events] Timestamp too old or in future");
		return false;
	}

	// Create signature base string and verify
	const sigBase = `v0:${timestamp}:${body}`;
	const mySignature = `v0=${createHmac("sha256", env.SLACK_SIGNING_SECRET).update(sigBase).digest("hex")}`;

	try {
		return timingSafeEqual(
			Buffer.from(mySignature, "utf8"),
			Buffer.from(signature, "utf8"),
		);
	} catch {
		return false;
	}
}

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

	// Verify signature
	if (!verifySlackSignature({ body, signature, timestamp })) {
		console.error("[slack/events] Signature verification failed");
		return Response.json({ error: "Invalid signature" }, { status: 401 });
	}

	const payload: SlackPayload = JSON.parse(body);

	// Handle URL verification challenge (Slack sends this when setting up Events URL)
	if (payload.type === "url_verification") {
		return Response.json({ challenge: payload.challenge });
	}

	// Handle event callbacks
	if (payload.type === "event_callback") {
		const { event, team_id, event_id } = payload;

		// Handle app_mention events (channel @mentions)
		if (event.type === "app_mention") {
			console.log("[slack/events] Received app_mention:", {
				eventId: event_id,
				teamId: team_id,
				channel: event.channel,
				user: event.user,
			});

			// Process async (Slack requires response within 3s)
			// In dev, call directly since QStash can't reach localhost
			// In prod, queue via QStash for reliability
			if (isDev) {
				// Fire and forget - don't await
				processSlackMention({
					event,
					teamId: team_id,
					eventId: event_id,
				}).catch((error) => {
					console.error("[slack/events] Process mention error:", error);
				});
			} else {
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
		}

		// Handle message.im events (DMs to the bot, including agent messages)
		if (
			event.type === "message" &&
			"channel_type" in event &&
			event.channel_type === "im"
		) {
			// Skip bot messages to prevent infinite loops
			if (event.bot_id || event.subtype === "bot_message" || !event.user) {
				console.log("[slack/events] Skipping bot message");
				return new Response("ok", { status: 200 });
			}

			console.log("[slack/events] Received message.im:", {
				eventId: event_id,
				teamId: team_id,
				channel: event.channel,
				user: event.user,
			});

			if (isDev) {
				processAssistantMessage({
					event,
					teamId: team_id,
					eventId: event_id,
				}).catch((err: unknown) => {
					console.error("[slack/events] Process assistant message error:", err);
				});
			} else {
				try {
					await qstash.publishJSON({
						url: `${env.NEXT_PUBLIC_API_URL}/api/integrations/slack/jobs/process-assistant-message`,
						body: {
							event,
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
		}

		// Handle assistant_thread_started (user opens agent chat)
		if (event.type === "assistant_thread_started") {
			console.log("[slack/events] Received assistant_thread_started:", {
				eventId: event_id,
				teamId: team_id,
				userId: event.assistant_thread.user_id,
				channelId: event.assistant_thread.channel_id,
			});
			// Optional: Set initial status or prompts here
		}

		// Handle assistant_thread_context_changed (user switches channels)
		if (event.type === "assistant_thread_context_changed") {
			console.log("[slack/events] Received assistant_thread_context_changed:", {
				eventId: event_id,
				teamId: team_id,
				contextChannelId: event.assistant_thread.context.channel_id,
			});
			// Optional: Update context-aware suggestions
		}

		// Handle link_shared events (URL unfurling)
		if (event.type === "link_shared") {
			console.log("[slack/events] Received link_shared:", {
				eventId: event_id,
				teamId: team_id,
				channel: event.channel,
				links: event.links,
			});

			// Process synchronously since unfurling needs quick response
			processLinkShared({
				event,
				teamId: team_id,
				eventId: event_id,
			}).catch((err: unknown) => {
				console.error("[slack/events] Process link shared error:", err);
			});
		}

		// Handle entity_details_requested events (Work Object flexpane)
		if (event.type === "entity_details_requested") {
			console.log("[slack/events] Received entity_details_requested:", {
				eventId: event_id,
				teamId: team_id,
				entityUrl: event.entity_url,
				externalRef: event.external_ref,
			});

			// Process synchronously since flexpane needs quick response
			processEntityDetails({
				event,
				teamId: team_id,
				eventId: event_id,
			}).catch((err: unknown) => {
				console.error("[slack/events] Process entity details error:", err);
			});
		}
	}

	// Always return 200 OK to Slack quickly
	return new Response("ok", { status: 200 });
}
