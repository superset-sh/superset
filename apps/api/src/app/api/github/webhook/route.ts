import { db } from "@superset/db/client";
import { webhookEvents } from "@superset/db/schema";
import { eq } from "drizzle-orm";

import { webhooks } from "./webhooks";

export async function POST(request: Request) {
	const body = await request.text();
	const signature = request.headers.get("x-hub-signature-256");
	const eventType = request.headers.get("x-github-event");
	const deliveryId = request.headers.get("x-github-delivery");

	const [webhookEvent] = await db
		.insert(webhookEvents)
		.values({
			provider: "github",
			eventId: deliveryId ?? `github-${Date.now()}`,
			eventType: eventType ?? "unknown",
			payload: JSON.parse(body),
			status: "pending",
		})
		.returning();

	if (!webhookEvent) {
		return Response.json({ error: "Failed to store event" }, { status: 500 });
	}

	try {
		await webhooks.verifyAndReceive({
			id: deliveryId ?? "",
			name: eventType as Parameters<
				typeof webhooks.verifyAndReceive
			>[0]["name"],
			payload: body,
			signature: signature ?? "",
		});

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

		const status =
			error instanceof Error && error.message.includes("signature") ? 401 : 500;

		return Response.json({ error: "Webhook failed" }, { status });
	}
}
