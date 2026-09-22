/**
 * The day partition of `ingest.webhook_payloads` a delivery's body is in.
 *
 * Deliberately a day and not the timestamp itself. `received_at` is a Postgres
 * timestamp, which keeps microseconds, and it reaches this route through a
 * JSON round trip as a JavaScript Date, which keeps milliseconds — so the
 * value here is `2026-09-08 03:25:01.812` where the row holds
 * `2026-09-08 03:25:01.812344`, and matching on it would find nothing. The day
 * survives that truncation intact, because dropping sub-millisecond digits only
 * ever moves a timestamp earlier within the same day, so it is safe to prune a
 * partition with. Exactness comes from matching the event row's own
 * `received_at` instead.
 */
export function partitionDay(receivedAt: Date): string {
	return receivedAt.toISOString().slice(0, 10);
}
