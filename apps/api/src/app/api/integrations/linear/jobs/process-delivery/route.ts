import type { LinearWebhookPayload } from "@linear/sdk/webhooks";
import { db } from "@superset/db/client";
import { webhookEvents } from "@superset/db/schema";
import { eq, sql } from "drizzle-orm";

import { verifyQstashRequest } from "@/lib/verifyQstash";
import { processDelivery } from "../../webhook/processDelivery";
import { linearDeliveryWorkSchema, PROCESS_PATH } from "../../webhook/queue";

export const dynamic = "force-dynamic";

/**
 * The fan-out walks every connected organization one at a time and each one
 * can cost a Linear API call, so this is nowhere near the platform default.
 * Matches the other job routes; QStash retries anything the platform kills.
 */
export const maxDuration = 300;

/**
 * The half of a Linear delivery that does the work, run by QStash after the
 * webhook route recorded the delivery and answered Linear.
 *
 * A non-2xx makes QStash retry, which is what a database or Linear hiccup
 * deserves — and a retry is cheap, because the per-connection rows mean only
 * the organizations that have not finished do any work the second time.
 * Anything that will never succeed answers 200 with a reason instead, so it is
 * not retried into the ground.
 */
export async function POST(request: Request): Promise<Response> {
	const body = await request.text();
	const rejected = await verifyQstashRequest(request, body, PROCESS_PATH);
	if (rejected) return rejected;

	let parsedBody: unknown;
	try {
		parsedBody = JSON.parse(body);
	} catch {
		return Response.json({ error: "Malformed work item" }, { status: 400 });
	}
	const parsed = linearDeliveryWorkSchema.safeParse(parsedBody);
	if (!parsed.success) {
		return Response.json({ error: "Unrecognised work item" }, { status: 400 });
	}
	const work = parsed.data;

	const accepted = await loadAcceptedDelivery(
		work.webhookEventId,
		work.receivedAt,
	);

	if (!accepted) {
		// The row is gone: retention removed it, or it never landed. Retrying
		// cannot bring it back.
		console.error(
			"[linear/process-delivery] no webhook event:",
			work.webhookEventId,
		);
		return Response.json({ skipped: "event missing" });
	}

	// A QStash redelivery of work that already finished, or a Linear retry that
	// got past both dedup windows.
	if (accepted.status === "processed" || accepted.status === "skipped") {
		return Response.json({ skipped: `already ${accepted.status}` });
	}

	if (!isLinearPayload(accepted.payload)) {
		// The body outlives the event row by seven days at most — its partition
		// is dropped well before retention touches the row that points at it.
		// Nothing to process and nothing a retry would recover.
		const error =
			accepted.payload === null ? "payload missing" : "payload unusable";
		console.error(`[linear/process-delivery] ${error}:`, work.webhookEventId);
		await markDelivery(work.webhookEventId, "failed", error);
		return Response.json({ skipped: error });
	}

	const { status, results } = await processDelivery({
		payload: accepted.payload,
		deliveryId: work.deliveryId,
	});

	if (status === "failed") {
		const error = results
			.filter((result) => result.outcome === "failed")
			.map((result) => `${result.connectionId}: ${result.error}`)
			.join("; ");
		await markDelivery(work.webhookEventId, "failed", error);
		return Response.json({ status, results }, { status: 500 });
	}

	await markDelivery(
		work.webhookEventId,
		status === "no_subscribers" ? "skipped" : "processed",
	);
	return Response.json({ status, results });
}

interface AcceptedDelivery {
	status: string;
	payload: unknown;
}

/**
 * The delivery's current state and the body recorded with it, in one round
 * trip.
 *
 * `received_at` is webhook_payloads' partition key, so passing it as a
 * constant makes the body a primary-key lookup inside a single day's
 * partition. It is cast through timestamptz rather than bound as a date: the
 * column is a timestamp without a zone holding UTC wall time, and this is what
 * makes the match independent of whatever timezone the driver would otherwise
 * serialize a Date in.
 */
async function loadAcceptedDelivery(
	webhookEventId: string,
	receivedAt: Date,
): Promise<AcceptedDelivery | null> {
	const result = await db.execute<{ status: string; payload: unknown }>(sql`
		SELECT e.status, p.payload
		FROM ingest.webhook_events e
		LEFT JOIN ingest.webhook_payloads p
			ON p.webhook_event_id = e.id
			AND p.received_at = ${receivedAt.toISOString()}::timestamptz AT TIME ZONE 'UTC'
		WHERE e.id = ${webhookEventId}
	`);

	const row = result.rows[0];
	return row ? { status: row.status, payload: row.payload ?? null } : null;
}

async function markDelivery(
	webhookEventId: string,
	status: "processed" | "skipped" | "failed",
	error?: string,
): Promise<void> {
	await db
		.update(webhookEvents)
		.set(
			status === "failed"
				? {
						status,
						error,
						retryCount: sql`${webhookEvents.retryCount} + 1`,
					}
				: { status, processedAt: new Date(), error: null },
		)
		.where(eq(webhookEvents.id, webhookEventId));
}

/**
 * The stored body, which is the payload with null characters stripped — the
 * form Postgres can actually hold, and so the safer of the two to mirror into
 * task rows.
 */
function isLinearPayload(value: unknown): value is LinearWebhookPayload {
	const payload = value as {
		organizationId?: unknown;
		type?: unknown;
		action?: unknown;
	} | null;
	return (
		typeof payload?.organizationId === "string" &&
		typeof payload.type === "string" &&
		typeof payload.action === "string"
	);
}
