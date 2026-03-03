import { LinearClient } from "@linear/sdk";
import {
	LINEAR_WEBHOOK_SIGNATURE_HEADER,
	LinearWebhookClient,
} from "@linear/sdk/webhooks";
import { db } from "@superset/db/client";
import {
	integrationConnections,
	type SelectIntegrationConnection,
	tasks,
	webhookEvents,
} from "@superset/db/schema";
import { and, eq, sql } from "drizzle-orm";
import { env } from "@/env";
import { syncLinearIssueById } from "../lib/issues/sync-linear-issue";

const webhookClient = new LinearWebhookClient(env.LINEAR_WEBHOOK_SECRET);

interface LinearWebhookPayload {
	type: string;
	action: string;
	organizationId: string;
	webhookTimestamp: string | number;
	data: Record<string, unknown>;
}

function extractIssueId(payload: LinearWebhookPayload): string | null {
	const data = payload.data;
	if (!data || typeof data !== "object") return null;

	if (payload.type === "Issue") {
		const id = data.id;
		return typeof id === "string" ? id : null;
	}

	const issueId = data.issueId;
	if (typeof issueId === "string") {
		return issueId;
	}

	const issue = data.issue;
	if (issue && typeof issue === "object") {
		const nestedId = (issue as { id?: unknown }).id;
		return typeof nestedId === "string" ? nestedId : null;
	}

	return null;
}

export async function POST(request: Request) {
	const body = await request.text();
	const signature = request.headers.get(LINEAR_WEBHOOK_SIGNATURE_HEADER);

	if (!signature) {
		return Response.json({ error: "Missing signature" }, { status: 401 });
	}

	let payload: LinearWebhookPayload;
	try {
		payload = webhookClient.parseData(
			Buffer.from(body),
			signature,
		) as LinearWebhookPayload;
	} catch (error) {
		console.warn("[linear/webhook] Invalid signature payload", error);
		return Response.json({ error: "Invalid signature" }, { status: 401 });
	}

	// Store event with idempotent handling
	const eventId = `${payload.organizationId}-${payload.webhookTimestamp}`;

	const [webhookEvent] = await db
		.insert(webhookEvents)
		.values({
			provider: "linear",
			eventId,
			eventType: `${payload.type}.${payload.action}`,
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
		console.log("[linear/webhook] Event already processed:", eventId);
		return Response.json({ success: true, message: "Already processed" });
	}
	if (webhookEvent.status !== "pending") {
		console.log(
			`[linear/webhook] Event in ${webhookEvent.status} state:`,
			eventId,
		);
		return Response.json({ success: true, message: "Event not ready" });
	}

	const connection = await db.query.integrationConnections.findFirst({
		where: and(
			eq(integrationConnections.externalOrgId, payload.organizationId),
			eq(integrationConnections.provider, "linear"),
		),
	});

	if (!connection) {
		await db
			.update(webhookEvents)
			.set({ status: "skipped", error: "No connection found" })
			.where(eq(webhookEvents.id, webhookEvent.id));
		return Response.json({ error: "Unknown organization" }, { status: 404 });
	}

	try {
		const status = await processWebhookEvent(payload, connection);

		await db
			.update(webhookEvents)
			.set({
				status,
				processedAt: new Date(),
			})
			.where(eq(webhookEvents.id, webhookEvent.id));

		return Response.json({ success: true });
	} catch (error) {
		await db
			.update(webhookEvents)
			.set({
				status: "failed",
				error: error instanceof Error ? error.message : "Unknown error",
				retryCount: webhookEvent.retryCount + 1,
			})
			.where(eq(webhookEvents.id, webhookEvent.id));

		return Response.json({ error: "Processing failed" }, { status: 500 });
	}
}

async function processWebhookEvent(
	payload: LinearWebhookPayload,
	connection: SelectIntegrationConnection,
): Promise<"processed" | "skipped"> {
	const issueId = extractIssueId(payload);
	if (!issueId) {
		return "skipped";
	}

	if (payload.type === "Issue" && payload.action === "remove") {
		await db
			.update(tasks)
			.set({ deletedAt: new Date(), lastSyncedAt: new Date() })
			.where(
				and(
					eq(tasks.organizationId, connection.organizationId),
					eq(tasks.externalProvider, "linear"),
					eq(tasks.externalId, issueId),
				),
			);
		return "processed";
	}

	const client = new LinearClient({ accessToken: connection.accessToken });
	return syncLinearIssueById({
		client,
		organizationId: connection.organizationId,
		creatorUserId: connection.connectedByUserId,
		issueId,
		linearAccessToken: connection.accessToken,
	});
}
