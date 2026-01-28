import { db } from "@superset/db/client";
import { webhookEvents } from "@superset/db/schema";
import { eq, sql } from "drizzle-orm";

import { webhooks } from "./webhooks";

export async function POST(request: Request) {
	const body = await request.text();
	const signature = request.headers.get("x-hub-signature-256");
	const eventType = request.headers.get("x-github-event");
	const deliveryId = request.headers.get("x-github-delivery");

	let payload: unknown;
	try {
		payload = JSON.parse(body);
	} catch {
		console.error("[github/webhook] Invalid JSON payload");
		return Response.json({ error: "Invalid JSON payload" }, { status: 400 });
	}

	// Verify signature BEFORE storing to prevent spam from unverified requests
	try {
		await webhooks.verify(body, signature ?? "");
	} catch (error) {
		console.error("[github/webhook] Signature verification failed:", error);
		return Response.json({ error: "Invalid signature" }, { status: 401 });
	}

	// Store verified event with idempotent handling
	const eventId = deliveryId ?? `github-${crypto.randomUUID()}`;

	const [webhookEvent] = await db
		.insert(webhookEvents)
		.values({
			provider: "github",
			eventId,
			eventType: eventType ?? "unknown",
			payload,
			status: "pending",
		})
		.onConflictDoUpdate({
			target: [webhookEvents.provider, webhookEvents.eventId],
			set: {
				// Reset for reprocessing only if previously failed
				status: sql`CASE WHEN ${webhookEvents.status} = 'failed' THEN 'pending' ELSE ${webhookEvents.status} END`,
				retryCount: sql`CASE WHEN ${webhookEvents.status} = 'failed' THEN ${webhookEvents.retryCount} + 1 ELSE ${webhookEvents.retryCount} END`,
				error: sql`CASE WHEN ${webhookEvents.status} = 'failed' THEN NULL ELSE ${webhookEvents.error} END`,
			},
		})
		.returning();

	if (!webhookEvent) {
		return Response.json({ error: "Failed to store event" }, { status: 500 });
	}

	// Idempotent: skip if already processed or not ready for processing
	if (webhookEvent.status === "processed") {
		console.log("[github/webhook] Event already processed:", eventId);
		return Response.json({ success: true, message: "Already processed" });
	}
	if (webhookEvent.status !== "pending") {
		console.log(
			`[github/webhook] Event in ${webhookEvent.status} state:`,
			eventId,
		);
		return Response.json({ success: true, message: "Event not ready" });
	}

	// Process the verified event
	try {
		await webhooks.receive({
			id: deliveryId ?? "",
			name: eventType,
			payload,
			// biome-ignore lint/suspicious/noExplicitAny: GitHub webhook event types are complex unions
		} as any);

		await db
			.update(webhookEvents)
			.set({ status: "processed", processedAt: new Date() })
			.where(eq(webhookEvents.id, webhookEvent.id));

		return Response.json({ success: true });
	} catch (error) {
		console.error("[github/webhook] Webhook processing error:", error);

		await db
			.update(webhookEvents)
			.set({
				status: "failed",
				error: error instanceof Error ? error.message : "Unknown error",
				retryCount: webhookEvent.retryCount + 1,
			})
			.where(eq(webhookEvents.id, webhookEvent.id));

		return Response.json(
			{ error: "Webhook processing failed" },
			{ status: 500 },
		);
	}
}
