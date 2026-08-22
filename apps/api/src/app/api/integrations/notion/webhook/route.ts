import { createHash } from "node:crypto";
import { db } from "@superset/db/client";
import type { SelectIntegrationConnection } from "@superset/db/schema";
import { integrationConnections, webhookEvents } from "@superset/db/schema";
import { and, asc, eq, isNull } from "drizzle-orm";

import { env } from "@/env";
import { ingestAutomationEvent } from "@/lib/automations/ingestAutomationEvent";
import { recordWebhookDelivery } from "@/lib/ingest/recordWebhookDelivery";
import { stripNullChars } from "@/lib/strip-null-chars";
import { cappedBody, parseJson } from "@/lib/webhooks/body";
import { hmacHex, timingSafeHex, unauthorized } from "@/lib/webhooks/verify";
import {
	HANDLED_EVENT_TYPES,
	type NotionWebhookEvent,
	normalizeNotionDelivery,
	notionWebhookEventSchema,
} from "./normalizeNotionDelivery";

export const maxDuration = 60;

/**
 * Notion signs every delivery with the verification token it sent when the
 * subscription was created: `sha256=` + HMAC-SHA256(token, raw body).
 */
const SIGNATURE_PREFIX = "sha256=";

export async function POST(request: Request) {
	const body = await cappedBody(request);
	if (body instanceof Response) return body;

	const json = parseJson<unknown>(body);
	if (json instanceof Response) return json;

	const token = env.NOTION_WEBHOOK_VERIFICATION_TOKEN;

	// The one-time handshake. Notion posts the token unsigned when the
	// subscription is created; it is pasted back into Notion's UI to verify,
	// and then becomes NOTION_WEBHOOK_VERIFICATION_TOKEN. There is no other
	// way to receive it than reading it here, so it is logged in full only
	// while the endpoint is still unconfigured — once a token is set, an
	// unauthenticated caller can no longer write arbitrary strings here, and
	// a fingerprint is enough to tell a re-verification apart.
	if (
		typeof json === "object" &&
		json !== null &&
		"verification_token" in json &&
		typeof json.verification_token === "string"
	) {
		if (token) {
			const fingerprint = createHash("sha256")
				.update(json.verification_token)
				.digest("hex")
				.slice(0, 12);
			console.log(
				"[notion/webhook] Verification handshake received while configured; token fingerprint",
				fingerprint,
			);
		} else {
			console.log(
				"[notion/webhook] Verification token received; set NOTION_WEBHOOK_VERIFICATION_TOKEN to:",
				json.verification_token,
			);
		}
		return Response.json({ ok: true });
	}

	if (!token) {
		return Response.json(
			{ error: "Notion webhook is not configured" },
			{ status: 503 },
		);
	}
	const signature = request.headers.get("x-notion-signature");
	if (
		!signature?.startsWith(SIGNATURE_PREFIX) ||
		!timingSafeHex(
			signature.slice(SIGNATURE_PREFIX.length),
			hmacHex(body, token),
		)
	) {
		return unauthorized("Invalid signature");
	}

	const parsed = notionWebhookEventSchema.safeParse(json);
	if (!parsed.success) {
		console.error("[notion/webhook] Unexpected payload:", parsed.error);
		return Response.json({ error: "Invalid payload" }, { status: 400 });
	}
	const event = parsed.data;

	// The subscription may carry more event types than the product names;
	// acknowledge those so Notion does not retry them.
	if (!HANDLED_EVENT_TYPES.has(event.type)) {
		return Response.json({ success: true, status: "ignored" });
	}

	const connections = await db.query.integrationConnections.findMany({
		where: and(
			eq(integrationConnections.provider, "notion"),
			eq(integrationConnections.externalOrgId, event.workspace_id),
			isNull(integrationConnections.disconnectedAt),
		),
		orderBy: [asc(integrationConnections.id)],
	});

	if (connections.length === 0) {
		console.log(
			"[notion/webhook] No active connections for workspace:",
			event.workspace_id,
		);
		return Response.json({ success: true, status: "no_subscribers" });
	}

	const results = await Promise.all(
		connections.map((connection) =>
			processForConnection(event, connection).catch((error) => ({
				connectionId: connection.id,
				outcome: "failed" as const,
				error: error instanceof Error ? error.message : "Unknown error",
			})),
		),
	);

	const anyFailed = results.some((r) => r.outcome === "failed");
	const allFailed = results.every((r) => r.outcome === "failed");
	if (anyFailed) {
		console.error("[notion/webhook] processing failures:", results);
	}
	return Response.json(
		{
			success: !allFailed,
			status: allFailed
				? "failed"
				: anyFailed
					? "partial_failure"
					: "processed",
		},
		{ status: allFailed ? 500 : 200 },
	);
}

async function processForConnection(
	event: NotionWebhookEvent,
	connection: SelectIntegrationConnection,
): Promise<{
	connectionId: string;
	outcome: "processed" | "skipped" | "failed";
	error?: string;
}> {
	// One ingest row per (delivery × connection): two organizations connected
	// to the same workspace each get their own retryable processing state.
	const eventId = `${connection.id}-${event.id}`;

	const webhookEvent = await recordWebhookDelivery({
		provider: "notion",
		eventId,
		eventType: event.type,
		payload: stripNullChars(event),
	});

	if (!webhookEvent) {
		return {
			connectionId: connection.id,
			outcome: "failed",
			error: "Failed to store event",
		};
	}
	if (webhookEvent.status === "processed") {
		return { connectionId: connection.id, outcome: "processed" };
	}
	if (webhookEvent.status !== "pending") {
		return { connectionId: connection.id, outcome: "skipped" };
	}

	try {
		const outcome = await ingestAutomationEvent(
			db,
			await normalizeNotionDelivery({
				organizationId: connection.organizationId,
				connectionId: connection.id,
				accessToken: connection.accessToken,
				event,
				webhookEventId: webhookEvent.id,
			}),
		);

		if (outcome.status === "skipped") {
			await db
				.update(webhookEvents)
				.set({
					status: "skipped",
					error: outcome.reason,
					processedAt: new Date(),
				})
				.where(eq(webhookEvents.id, webhookEvent.id));
			return { connectionId: connection.id, outcome: "skipped" };
		}

		if (outcome.status === "dispatched") {
			console.log(
				`[notion/webhook] ${outcome.matched}/${outcome.considered} triggers matched:`,
				event.id,
			);
		}
		await db
			.update(webhookEvents)
			.set({ status: "processed", processedAt: new Date() })
			.where(eq(webhookEvents.id, webhookEvent.id));

		return { connectionId: connection.id, outcome: "processed" };
	} catch (error) {
		const message = error instanceof Error ? error.message : "Unknown error";
		await db
			.update(webhookEvents)
			.set({
				status: "failed",
				error: message,
				retryCount: webhookEvent.retryCount + 1,
			})
			.where(eq(webhookEvents.id, webhookEvent.id));
		return { connectionId: connection.id, outcome: "failed", error: message };
	}
}
