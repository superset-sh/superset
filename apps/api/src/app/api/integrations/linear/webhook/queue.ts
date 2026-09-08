import { Client } from "@upstash/qstash";
import { z } from "zod";

import { env } from "@/env";

/**
 * Linear gives a webhook endpoint five seconds, then retries at 1 minute, 1
 * hour and 6 hours and may disable the webhook outright. One Linear
 * organization can be connected to many Superset organizations, and the route
 * used to do every one of their task-mirror and automation writes inline: 17
 * connections meant ~100 database queries per delivery, ~40 of them at once,
 * which is what exhausts Neon's per-compute connect permits during a bulk
 * edit (Sentry API-18) and what put p95 at 15.7s — past Linear's own timeout.
 *
 * So the route now does only what proves the delivery is Linear's, records it,
 * and hands the fan-out to QStash; `jobs/process-delivery` does the rest with
 * retries and no clock over its head.
 */
const qstash = new Client({ token: env.QSTASH_TOKEN, baseUrl: env.QSTASH_URL });

export const PROCESS_PATH =
	"/api/integrations/linear/jobs/process-delivery" as const;
const PROCESS_URL = `${env.NEXT_PUBLIC_API_URL}${PROCESS_PATH}`;

/**
 * A pointer, not the body. The body is already in ingest.webhook_payloads by
 * the time this is published, and keeping it out of the message means no
 * delivery can outgrow QStash's message limit — a limit that would otherwise
 * turn one oversized issue description into a webhook Linear disables.
 *
 * `receivedAt` travels with the id because it is the partition key: with it
 * the consumer's read is a primary-key lookup in one day's partition.
 */
export const linearDeliveryWorkSchema = z.object({
	webhookEventId: z.uuid(),
	receivedAt: z.coerce.date(),
	deliveryId: z.string().nullable(),
});
export type LinearDeliveryWork = z.infer<typeof linearDeliveryWorkSchema>;

/**
 * Throws if QStash will not take the message. The caller must not acknowledge
 * a delivery it has failed to queue: the row is durable but nothing would ever
 * pick it up, and a webhook lost in silence is worse than one Linear retries.
 */
export async function enqueueLinearDelivery(
	work: LinearDeliveryWork,
): Promise<void> {
	// Deliberately no `deduplicationId`. It looks made for this — one id per
	// delivery — but QStash keeps deduplication ids for 90 days, so once a
	// message had exhausted its retries the same id would silently swallow
	// Linear's 1-hour and 6-hour redeliveries of that event: accepted, not
	// enqueued, 200. The delivery's own row dedupes instead, and it has the
	// right lifetime — the route queues nothing whose row is already carried
	// through, and `recordWebhookDelivery` reopens a failed one so a redelivery
	// is queued again. A duplicate that does get through costs one query.
	await qstash.publishJSON({
		url: PROCESS_URL,
		body: { ...work, receivedAt: work.receivedAt.toISOString() },
		retries: 3,
	});
}
