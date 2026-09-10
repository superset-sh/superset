import { deliveryHeaderFromRow } from "../../webhook/deliveryIds";

/**
 * One row of the band, as the sweep's query returns it. A type alias rather
 * than an interface so it carries the implicit index signature `execute`
 * requires of a row shape.
 */
export type AbandonedRow = {
	id: string;
	event_id: string;
	received_at: string | Date;
	retry_count: number;
};

export interface SweepPlan {
	/** Given up on: enough attempts have been spent to stop trying. */
	exhausted: string[];
	/**
	 * To hand back to QStash, already resolved to what the consumer needs, plus
	 * the `retry_count` the row was read at. That count is carried so the
	 * write-back can fence on it: the consumer increments the same column when
	 * it fails, and an unfenced increment on top of the consumer's would spend
	 * two of a delivery's attempts for one.
	 */
	requeue: Array<{
		observedRetryCount: number;
		webhookEventId: string;
		receivedAt: Date;
		deliveryId: string | null;
	}>;
	/** Rows the band turned up that are not deliveries, which is a bug if > 0. */
	unrecognised: string[];
}

/**
 * Decides what one sweep does with the rows it found: which deliveries are
 * handed back to QStash, which have had enough and are given up on, and which
 * are not deliveries at all.
 *
 * Separate from the route because this is the part with the rules in it — the
 * give-up threshold, the per-run ceiling, and the refusal to treat a
 * per-connection row as a whole delivery — and none of them need a database to
 * be worth pinning down.
 */
export function planSweep(
	rows: AbandonedRow[],
	{ maxAttempts, maxRequeues }: { maxAttempts: number; maxRequeues: number },
): SweepPlan {
	const plan: SweepPlan = { exhausted: [], requeue: [], unrecognised: [] };

	for (const row of rows) {
		if (row.retry_count >= maxAttempts) {
			plan.exhausted.push(row.id);
			continue;
		}
		if (plan.requeue.length >= maxRequeues) continue;

		// A per-connection row cannot reach here — only the row recorded per
		// delivery carries the prefix the query matches on — but re-queueing one
		// would fan out a fragment of a delivery, so this refuses rather than
		// assumes. `undefined` is "not a delivery row"; `null` is the real and
		// different answer "this delivery arrived without a header".
		const deliveryId = deliveryHeaderFromRow(row.event_id);
		if (deliveryId === undefined) {
			plan.unrecognised.push(row.event_id);
			continue;
		}

		plan.requeue.push({
			observedRetryCount: row.retry_count,
			webhookEventId: row.id,
			receivedAt: toDate(row.received_at),
			deliveryId,
		});
	}

	return plan;
}

/**
 * The driver hands timestamps back as strings holding UTC wall time, the same
 * shape `recordWebhookDelivery` parses.
 */
function toDate(value: string | Date): Date {
	if (value instanceof Date) return value;
	return new Date(`${String(value).replace(" ", "T")}Z`);
}
