/**
 * The identity a Linear delivery dedupes on, and the identity of that
 * delivery's work on one connection.
 *
 * Linear's `linear-delivery` header is stable across its retries, which is
 * what makes it a dedup key. The payload carries no delivery id of its own, so
 * without the header the organization, send time, entity and action stand in
 * for one — the timestamp alone collides for bulk edits landing in the same
 * millisecond.
 */
export interface DeliveryIdentity {
	organizationId: string;
	type: string;
	action: string;
	webhookTimestamp: number;
	data?: { id?: unknown } | null;
}

/**
 * One id per delivery, connection-independent, so the row recorded before the
 * webhook is acknowledged is the delivery itself rather than a delivery seen
 * through one subscriber.
 */
export function deliveryEventId(
	payload: DeliveryIdentity,
	deliveryHeader: string | null,
): string {
	if (deliveryHeader) return deliveryHeader;
	const entityId = payload.data?.id;
	return `${payload.organizationId}-${payload.webhookTimestamp}-${payload.type}-${entityId ?? payload.action}`;
}

/**
 * Marks the one row per delivery, as opposed to the per-connection rows that
 * share the table. The sweep needs to tell them apart — re-queueing a
 * per-connection row would mean fanning out a fragment of a delivery — and
 * this is the only thing in the row that distinguishes them.
 *
 * The letter after it records whether Linear sent a delivery header, which
 * cannot be recovered from the id itself: `c` ids are the composite fallback,
 * whose first field is an organization id, and nothing reliably tells that
 * shape from a header. The consumer needs the difference, because a delivery
 * with no header derives its automation-event dedup key differently.
 */
const DELIVERY_PREFIX = "delivery:";
const WITH_HEADER = `${DELIVERY_PREFIX}h:`;
const WITHOUT_HEADER = `${DELIVERY_PREFIX}c:`;

/** Length of the marker the sweep matches on, kept in step with the prefix. */
export const DELIVERY_PREFIX_LENGTH = DELIVERY_PREFIX.length;

/** The `event_id` of the row recorded before a delivery is acknowledged. */
export function deliveryRowEventId(
	payload: DeliveryIdentity,
	deliveryHeader: string | null,
): string {
	return deliveryHeader
		? `${WITH_HEADER}${deliveryHeader}`
		: `${WITHOUT_HEADER}${deliveryEventId(payload, null)}`;
}

/**
 * The delivery header a row was recorded with, exactly as the webhook route
 * had it — `null` where there was none, which is a value the consumer acts on
 * rather than a failure to parse. Returns `undefined` for anything that is not
 * a delivery row, so a per-connection row can never be re-queued as if it
 * were a whole delivery.
 */
export function deliveryHeaderFromRow(
	eventId: string,
): string | null | undefined {
	if (eventId.startsWith(WITH_HEADER)) {
		return eventId.slice(WITH_HEADER.length);
	}
	if (eventId.startsWith(WITHOUT_HEADER)) return null;
	return undefined;
}

/**
 * One row per (delivery × connection) so each subscriber's processing status
 * is independently retryable: a redelivery re-runs only the connections that
 * have not finished.
 *
 * Deliberately a prefix of `deliveryEventId`, which is the format these ids
 * have always had — changing it would orphan every in-flight row and let a
 * redelivery process twice.
 */
export function connectionEventId(
	connectionId: string,
	deliveryEventId: string,
): string {
	return `${connectionId}-${deliveryEventId}`;
}
