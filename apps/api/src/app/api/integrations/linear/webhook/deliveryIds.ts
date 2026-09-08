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
