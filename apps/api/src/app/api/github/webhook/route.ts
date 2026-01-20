import { db } from "@superset/db/client";
import { webhookEvents } from "@superset/db/schema";
import { eq } from "drizzle-orm";

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

	// Store verified event
	const [webhookEvent] = await db
		.insert(webhookEvents)
		.values({
			provider: "github",
			eventId: deliveryId ?? `github-${crypto.randomUUID()}`,
			eventType: eventType ?? "unknown",
			payload,
			status: "pending",
		})
		.returning();

	if (!webhookEvent) {
		return Response.json({ error: "Failed to store event" }, { status: 500 });
	}

	// Process the verified event
	try {
		// biome-ignore lint/suspicious/noExplicitAny: GitHub webhook event types are complex unions
		await webhooks.receive({
			id: deliveryId ?? "",
			name: eventType,
			payload,
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

		return Response.json({ error: "Webhook processing failed" }, { status: 500 });
	}
}
