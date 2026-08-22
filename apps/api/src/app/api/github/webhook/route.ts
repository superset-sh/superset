import { db } from "@superset/db/client";
import { githubInstallations, webhookEvents } from "@superset/db/schema";
import { eq } from "drizzle-orm";
import { ingestAutomationEvent } from "@/lib/automations/ingestAutomationEvent";
import { recordWebhookDelivery } from "@/lib/ingest/recordWebhookDelivery";
import { stripNullChars } from "@/lib/strip-null-chars";
import {
	type GithubPayload,
	normalizeGithubDelivery,
} from "./normalizeGithubDelivery";
import { webhooks } from "./webhooks";

export const maxDuration = 60;

export async function POST(request: Request) {
	const body = await request.text();
	const signature = request.headers.get("x-hub-signature-256");
	const eventType = request.headers.get("x-github-event");
	const deliveryId = request.headers.get("x-github-delivery");

	// Verify signature BEFORE parsing or storing so unauthenticated bodies get
	// no further. `verify` returns false on a mismatch and only throws when the
	// signature is missing, so both outcomes have to be checked.
	let signatureValid = false;
	try {
		signatureValid = await webhooks.verify(body, signature ?? "");
	} catch (error) {
		console.error("[github/webhook] Signature verification failed:", error);
	}
	if (!signatureValid) {
		return Response.json({ error: "Invalid signature" }, { status: 401 });
	}

	let payload: unknown;
	try {
		payload = JSON.parse(body);
	} catch {
		console.error("[github/webhook] Invalid JSON payload");
		return Response.json({ error: "Invalid JSON payload" }, { status: 400 });
	}

	// Store verified event with idempotent handling
	const eventId = deliveryId ?? `github-${crypto.randomUUID()}`;

	const webhookEvent = await recordWebhookDelivery({
		provider: "github",
		eventId,
		eventType: eventType ?? "unknown",
		payload: stripNullChars(payload),
	});

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

		// Pings and a few org-level events carry no installation, and an
		// installation this deployment never saw has no organization: neither
		// is recorded as an automation event.
		const installationId = (payload as GithubPayload).installation?.id;
		const installation =
			installationId === undefined
				? undefined
				: await db.query.githubInstallations.findFirst({
						where: eq(
							githubInstallations.installationId,
							String(installationId),
						),
						columns: { organizationId: true },
					});
		const outcome = installation
			? await ingestAutomationEvent(
					db,
					normalizeGithubDelivery({
						organizationId: installation.organizationId,
						eventType: eventType ?? "unknown",
						deliveryId: eventId,
						payload: payload as GithubPayload,
						webhookEventId: webhookEvent.id,
					}),
				)
			: null;

		await db
			.update(webhookEvents)
			.set({ status: "processed", processedAt: new Date() })
			.where(eq(webhookEvents.id, webhookEvent.id));

		return Response.json({ success: true, outcome });
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
