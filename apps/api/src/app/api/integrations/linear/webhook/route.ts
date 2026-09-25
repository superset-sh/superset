import type { LinearWebhookPayload } from "@linear/sdk/webhooks";
import {
	LINEAR_WEBHOOK_SIGNATURE_HEADER,
	LinearWebhookClient,
} from "@linear/sdk/webhooks";

import { env } from "@/env";
import { recordWebhookDelivery } from "@/lib/ingest/recordWebhookDelivery";
import { stripNullChars } from "@/lib/strip-null-chars";
import { verifyHookdeckDelivery } from "@/lib/webhooks/hookdeck";
import { deliveryRowEventId } from "./deliveryIds";
import { hasActiveSubscriber } from "./processDelivery";
import { enqueueLinearDelivery } from "./queue";

const webhookClient = new LinearWebhookClient(env.LINEAR_WEBHOOK_SECRET);

/**
 * Accepts a Linear delivery and does no work on it.
 *
 * The route proves the delivery is Linear's, checks somebody is still
 * subscribed, writes it — identity and body, one round trip — and hands the
 * fan-out to QStash. Everything a delivery owes the organizations connected to
 * it happens in `jobs/process-delivery`. Two indexed queries and a publish,
 * where this used to run every connected organization's task-mirror and
 * automation writes inline.
 *
 * The order is the contract: nothing is acknowledged before it is durable, and
 * nothing is acknowledged that has not been queued. A delivery recorded but not
 * queued gets a 500 so Linear retries it, because a row nothing will ever pick
 * up is a webhook lost in silence.
 */
export async function POST(request: Request) {
	const body = await request.text();

	// Both paths stay live through a cutover: traffic still arriving straight
	// from Linear verifies as it always has, and rolling back is repointing the
	// URL rather than shipping a deploy.
	const hookdeck = verifyHookdeckDelivery(request, body);
	if (hookdeck instanceof Response) return hookdeck;

	let payload: LinearWebhookPayload;
	if (hookdeck === "verified") {
		// Deliberately not re-checking Linear's signature. Hookdeck verified it
		// at ingest, and Linear's covers a timestamp inside a ±60s replay window
		// that Hookdeck preserves on retry — so checking it here would reject
		// every retry, which is the delivery the gateway exists to save.
		try {
			payload = JSON.parse(body) as LinearWebhookPayload;
		} catch {
			return Response.json({ error: "Malformed payload" }, { status: 400 });
		}
	} else {
		const signature = request.headers.get(LINEAR_WEBHOOK_SIGNATURE_HEADER);
		if (!signature) {
			return Response.json({ error: "Missing signature" }, { status: 401 });
		}
		try {
			payload = parseVerifiedPayload(body, signature);
		} catch (error) {
			console.warn(
				"[linear/webhook] rejected delivery:",
				error instanceof Error ? error.message : error,
			);
			return Response.json({ error: "Invalid signature" }, { status: 401 });
		}
	}

	// Deliveries for a Linear organization that has disconnected are dropped
	// here rather than recorded and queued, which is what the route has always
	// done with them.
	if (!(await hasActiveSubscriber(payload.organizationId))) {
		console.log(
			"[linear/webhook] No active connections for Linear org:",
			payload.organizationId,
		);
		return Response.json({ success: true, status: "no_subscribers" });
	}

	const deliveryId = request.headers.get("linear-delivery");
	const eventId = deliveryRowEventId(payload, deliveryId);

	const accepted = await recordWebhookDelivery({
		provider: "linear",
		eventId,
		eventType: `${payload.type}.${payload.action}`,
		payload: stripNullChars(payload),
	});

	if (!accepted) {
		return Response.json({ error: "Failed to store event" }, { status: 500 });
	}

	// A delivery already carried through, or one deliberately not carried
	// through. `recordWebhookDelivery` resets a failed row to pending, so a
	// redelivery of something that broke is queued again rather than landing
	// here.
	if (accepted.status !== "pending") {
		return Response.json({ success: true, status: accepted.status });
	}

	try {
		await enqueueLinearDelivery({
			webhookEventId: accepted.id,
			receivedAt: accepted.receivedAt,
			deliveryId,
		});
	} catch (error) {
		console.error("[linear/webhook] failed to queue delivery:", error);
		return Response.json(
			{ error: "Failed to queue delivery" },
			{ status: 500 },
		);
	}

	return Response.json({ success: true, status: "accepted" });
}

// The SDK only enforces Linear's ±60s replay window when handed the
// timestamp, and the timestamp lives inside the body being verified.
function parseVerifiedPayload(
	body: string,
	signature: string,
): LinearWebhookPayload {
	const { webhookTimestamp } = JSON.parse(body) as {
		webhookTimestamp?: unknown;
	};
	return webhookClient.parseData(
		Buffer.from(body),
		signature,
		typeof webhookTimestamp === "number" ? webhookTimestamp : undefined,
	);
}
