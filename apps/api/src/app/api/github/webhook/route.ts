import { db } from "@superset/db/client";
import { githubInstallations, webhookEvents } from "@superset/db/schema";
import { eq } from "drizzle-orm";
import type { IngestOutcome } from "@/lib/automations/ingestAutomationEvent";
import { ingestAutomationEvent } from "@/lib/automations/ingestAutomationEvent";
import { databaseErrorMessage } from "@/lib/databaseErrorMessage";
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

	// Process the verified event. The catch covers the work and nothing else:
	// recording the outcome below is bookkeeping, and a failure to record it is
	// not a failure of the work that already happened.
	let outcome: IngestOutcome | null = null;
	let failure: string | null = null;
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
		outcome = installation
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
	} catch (error) {
		// The driver's message, not Drizzle's: this one is stored on the row and
		// logged, and Drizzle's carries every bind parameter — the whole webhook
		// body among them, since recordAutomationEvent binds it.
		failure = databaseErrorMessage(error);
		console.error("[github/webhook] Webhook processing error:", failure);
	}

	// One write for either outcome, and it is deliberately outside the catch
	// above. When the database is what failed, a second write to it cannot
	// report that: it throws in turn and replaces the original error with its
	// own. Letting this one throw reports what actually broke and leaves the
	// delivery `pending` for a redelivery, rather than marking work that
	// succeeded as `failed` and inviting it to be done twice.
	await db
		.update(webhookEvents)
		.set(
			failure === null
				? { status: "processed", processedAt: new Date() }
				: {
						status: "failed",
						error: failure,
						retryCount: webhookEvent.retryCount + 1,
					},
		)
		.where(eq(webhookEvents.id, webhookEvent.id));

	return failure === null
		? Response.json({ success: true, outcome })
		: Response.json({ error: "Webhook processing failed" }, { status: 500 });
}
