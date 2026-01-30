import { createHmac, timingSafeEqual } from "node:crypto";
import { Client } from "@upstash/qstash";

import { env } from "@/env";
import { processEntityDetails } from "./process-entity-details";
import { processLinkShared } from "./process-link-shared";

const qstash = new Client({ token: env.QSTASH_TOKEN });

function verifySlackSignature({
	body,
	signature,
	timestamp,
}: {
	body: string;
	signature: string;
	timestamp: string;
}): boolean {
	// Reject timestamps >5 min old to prevent replay attacks
	const timestampSec = Number.parseInt(timestamp, 10);
	const now = Math.floor(Date.now() / 1000);
	if (Math.abs(now - timestampSec) > 60 * 5) {
		console.error("[slack/events] Timestamp too old or in future");
		return false;
	}

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

	if (!verifySlackSignature({ body, signature, timestamp })) {
		console.error("[slack/events] Signature verification failed");
		return Response.json({ error: "Invalid signature" }, { status: 401 });
	}

	const payload = JSON.parse(body);

	// Slack sends this once when configuring the Events URL
	if (payload.type === "url_verification") {
		return Response.json({ challenge: payload.challenge });
	}

	if (payload.type === "event_callback") {
		const { event, team_id, event_id } = payload;

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

		if (event.type === "message" && event.channel_type === "im") {
			// Skip bot messages to prevent infinite loops
			if (event.bot_id || event.subtype === "bot_message" || !event.user) {
				return new Response("ok", { status: 200 });
			}

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

		if (event.type === "link_shared") {
			processLinkShared({
				event,
				teamId: team_id,
				eventId: event_id,
			}).catch((err: unknown) => {
				console.error("[slack/events] Process link shared error:", err);
			});
		}

		if (event.type === "entity_details_requested") {
			processEntityDetails({
				event,
				teamId: team_id,
				eventId: event_id,
			}).catch((err: unknown) => {
				console.error("[slack/events] Process entity details error:", err);
			});
		}
	}

	// Slack requires 200 within 3s regardless of event type
	return new Response("ok", { status: 200 });
}
