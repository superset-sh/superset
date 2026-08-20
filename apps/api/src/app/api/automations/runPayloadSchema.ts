import { z } from "zod";

/**
 * The QStash body a run is enqueued with, and therefore what both the dispatch
 * route and the failure callback (which echoes the source body) parse.
 *
 * A run comes from a schedule or from an event, never both. Scheduled runs
 * carry the minute they were due, which is also their dedupe key, plus the
 * trigger that was due when the evaluator knows it; event runs carry the
 * trigger and the event instead, and have no scheduled time.
 */
export const runPayloadSchema = z.union([
	// Strict, so a payload carrying both causes is rejected rather than
	// silently treated as whichever branch happens to match first.
	z
		.object({
			automationId: z.string().uuid(),
			scheduledFor: z.string().datetime(),
			triggerId: z.string().uuid().optional(),
		})
		.strict(),
	z
		.object({
			automationId: z.string().uuid(),
			triggerId: z.string().uuid(),
			eventId: z.string().uuid(),
		})
		.strict(),
]);

export type RunPayload = z.infer<typeof runPayloadSchema>;
