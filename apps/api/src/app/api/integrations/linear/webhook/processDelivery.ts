import type { LinearWebhookPayload } from "@linear/sdk/webhooks";
import { db } from "@superset/db/client";
import type { SelectConnection } from "@superset/db/schema";
import { connections, webhookEvents } from "@superset/db/schema";
import { accountConnections } from "@superset/trpc/connectors";
import {
	organizationSyncs,
	syncingOrganizationIds,
} from "@superset/trpc/sync-policy";
import { and, eq, isNull } from "drizzle-orm";
import { ingestAutomationEvent } from "@/lib/automations/ingestAutomationEvent";
import { recordWebhookDelivery } from "@/lib/ingest/recordWebhookDelivery";
import { stripNullChars } from "@/lib/strip-null-chars";
import { connectionEventId, deliveryEventId } from "./deliveryIds";
import {
	type LinearDelivery,
	matchableFrom,
	normalizeLinearDelivery,
} from "./normalizeLinearDelivery";

export interface ConnectionResult {
	connectionId: string;
	outcome: "processed" | "skipped" | "failed";
	error?: string;
}

export interface DeliveryResult {
	status: "processed" | "no_subscribers" | "failed";
	results: ConnectionResult[];
}

/**
 * Whether any syncing Superset organization is still connected to this Linear
 * organization.
 *
 * The accept path keeps this one indexed lookup so a delivery nobody
 * subscribes to costs what it always did — a query and nothing else. Both
 * halves of the condition drop a large share of the traffic: a third of the
 * Linear organizations on record have disconnected every one of their
 * connections, and most of the rest belong to organizations on the free plan,
 * where Linear automations are behind the paywall.
 */
export async function hasActiveSubscriber(
	externalOrgId: string,
): Promise<boolean> {
	const [subscriber] = await db
		.select({ id: connections.id })
		.from(connections)
		.where(
			and(
				eq(connections.connector, "linear"),
				eq(connections.externalAccountId, externalOrgId),
				isNull(connections.disconnectedAt),
				organizationSyncs(connections.organizationId),
			),
		)
		.limit(1);
	return subscriber !== undefined;
}

/**
 * Everything one Linear delivery owes every Superset organization connected to
 * that Linear organization. Runs off the request path, after the webhook has
 * been recorded and acknowledged.
 *
 * The connections are walked one at a time on purpose. neon-http opens a
 * connection per query, and a `Promise.all` over 17 connections asked for 17 at
 * the same instant, every one of them a miss against the proxy's idle pool and
 * so a permit on the per-compute semaphore that only has 100 with a 10ms
 * timeout. In sequence they reuse one pooled connection instead. Bounding it
 * this way was never affordable while Linear was still holding the response
 * open; it is the whole reason the delivery is acknowledged first.
 */
export async function processDelivery({
	payload,
	deliveryId,
}: {
	payload: LinearWebhookPayload;
	deliveryId: string | null;
}): Promise<DeliveryResult> {
	const connected = await accountConnections("linear", payload.organizationId);
	// One Linear organization fans out to every Superset organization connected
	// to it, and they need not share a plan: the iced ones are dropped here
	// rather than at the route, which only knows that somebody syncing is
	// subscribed.
	const syncing = await syncingOrganizationIds(
		connected.map((connection) => connection.organizationId),
	);
	const subscribers = connected.filter((connection) =>
		syncing.has(connection.organizationId),
	);

	if (subscribers.length === 0) {
		console.log(
			"[linear/process-delivery] No active connections for Linear org:",
			payload.organizationId,
		);
		return { status: "no_subscribers", results: [] };
	}

	console.log(
		`[linear/process-delivery] ${payload.type}.${payload.action} fans out to ${subscribers.length} connection(s) across ${new Set(subscribers.map((c) => c.organizationId)).size} organization(s)`,
	);

	// Caught per connection, and the loop runs to the end regardless: one
	// organization's broken token or missing workflow state must not cost the
	// other sixteen their delivery.
	const results: ConnectionResult[] = [];
	for (const connection of subscribers) {
		results.push(
			await processForConnection(payload, deliveryId, connection).catch(
				(error) => ({
					connectionId: connection.id,
					outcome: "failed" as const,
					error: errorMessage(error),
				}),
			),
		);
	}

	const anyFailed = results.some((result) => result.outcome === "failed");
	if (anyFailed) {
		console.error("[linear/process-delivery] processing failures:", results);
	}

	return { status: anyFailed ? "failed" : "processed", results };
}

async function processForConnection(
	payload: LinearWebhookPayload,
	deliveryId: string | null,
	connection: SelectConnection,
): Promise<ConnectionResult> {
	// One webhookEvents row per (Linear event × Superset connection) so each
	// tenant's processing status is independently retryable, and so a retried
	// delivery only re-runs the connections that have not finished.
	const eventId = connectionEventId(
		connection.id,
		deliveryEventId(payload, deliveryId),
	);

	const webhookEvent = await recordWebhookDelivery({
		provider: "linear",
		eventId,
		eventType: `${payload.type}.${payload.action}`,
		payload: stripNullChars(payload),
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

	if (isEntityDelivery(payload)) {
		try {
			await ingest(payload, deliveryId, connection, webhookEvent.id);
		} catch (error) {
			console.error(
				"[linear/process-delivery] automation event failed:",
				error,
			);
			const message = errorMessage(error);
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

	await db
		.update(webhookEvents)
		.set({ status: "processed", processedAt: new Date() })
		.where(eq(webhookEvents.id, webhookEvent.id));

	return { connectionId: connection.id, outcome: "processed" };
}

function errorMessage(error: unknown): string {
	return error instanceof Error ? error.message : "Unknown error";
}

/** Entity deliveries carry `data`; OAuth and notification payloads do not. */
function isEntityDelivery(payload: unknown): payload is LinearDelivery {
	const data = (payload as { data?: { id?: unknown } }).data;
	return typeof data?.id === "string";
}

async function ingest(
	delivery: LinearDelivery,
	deliveryHeader: string | null,
	connection: SelectConnection,
	webhookEventId: string,
): Promise<void> {
	const event = matchableFrom(delivery);
	// Nothing in the product names this delivery, so there is nothing to record.
	if (event.names.length === 0) return;

	// Linear's per-delivery id is stable across its retries. The payload itself
	// carries no such id, so without the header the entity and send time stand
	// in for one.
	const deliveryId =
		deliveryHeader ??
		`${delivery.type}:${delivery.data.id}:${delivery.webhookTimestamp}`;

	await ingestAutomationEvent(
		db,
		normalizeLinearDelivery({
			delivery,
			event,
			deliveryId,
			connection,
			webhookEventId,
		}),
	);
}
