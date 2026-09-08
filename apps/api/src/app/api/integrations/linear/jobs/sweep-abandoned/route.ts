import { webhookEvents } from "@superset/db/schema";
import { and, eq, gte, inArray, sql } from "drizzle-orm";

import { singleFlight } from "@/lib/singleFlight";
import { verifyQstashRequest } from "@/lib/verifyQstash";
import { DELIVERY_PREFIX_LENGTH } from "../../webhook/deliveryIds";
import { enqueueLinearDelivery } from "../../webhook/queue";
import { type AbandonedRow, planSweep } from "./planSweep";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export const SWEEP_PATH =
	"/api/integrations/linear/jobs/sweep-abandoned" as const;

/**
 * How long a delivery has to sit unfinished before it counts as abandoned
 * rather than in flight.
 *
 * The consumer's own ceiling is `maxDuration = 300`, so five minutes is the
 * longest a delivery can legitimately be mid-processing, and QStash's three
 * retries are done well inside the hour. An hour is also where Linear's second
 * redelivery lands, so its own retry gets first attempt at anything broken and
 * this is the backstop behind it. Well inside the seven days that
 * `webhook_payloads` keeps a body, so anything swept can still be read.
 */
const ABANDONED_AFTER_MINUTES = 60;

/**
 * How much of the timeline one run looks at: deliveries received between 75
 * and 60 minutes ago.
 *
 * Fifteen minutes is a measured ceiling, not a guess. The band is the entire
 * cost of this route, and on production-shaped data fifteen minutes of ingest
 * is 22.7k rows, 539ms, and sorts in memory. An hour is 89.4k rows, 4.9s, and
 * spills to disk — too much to run on a schedule for something that finds
 * nothing almost every time.
 *
 * This is a rolling backstop, not a catch-up: a delivery is examined while it
 * sits in the band and never again. So the band has to stay wider than the
 * cadence — at every 5 minutes each delivery passes under three runs, and two
 * can be missed entirely before anything goes unexamined. An outage longer
 * than that leaves its deliveries to Linear's own redeliveries.
 */
const BAND_MINUTES = 15;

/**
 * Attempts a delivery gets before it is given up on. Counts every attempt the
 * row has been through, not only this route's: the consumer increments it on
 * failure and `recordWebhookDelivery` increments it when a Linear redelivery
 * reopens a failed row. A poison delivery therefore stops being re-queued
 * within a few sweeps rather than being carried around the loop forever.
 */
const MAX_ATTEMPTS = 5;

/** Ceiling on re-queues per run, so one run cannot become the incident. */
const MAX_REQUEUES = 50;

/**
 * Anything the band turns up beyond this is left for the next run. Generous
 * against `MAX_REQUEUES` so the give-up marking still sees rows past the cap.
 */
const MAX_ROWS = 500;

/**
 * Publishes to give up on in a row before abandoning the run.
 *
 * Failures here are not row-specific — the message is a fixed-shape pointer, so
 * a publish fails because QStash is unreachable or refusing, which the next row
 * will discover too. Without this, an outage costs 50 doomed publishes at two
 * attempts each, which can outrun `maxDuration` and kill the run before the
 * write-back below commits — leaving deliveries that *were* published
 * uncounted, to be published again next run.
 */
const MAX_CONSECUTIVE_PUBLISH_FAILURES = 3;

/**
 * Re-queues Linear deliveries that were accepted but never carried through,
 * and gives up on the ones that have had enough attempts.
 *
 * The gap this closes: the webhook route answers Linear the moment a delivery
 * is durable, and everything after that is QStash's to retry. When QStash
 * exhausts its retries the message goes to its dead-letter queue and the row
 * stays `pending` or `failed` with nothing left to pick it up. Linear's own
 * redeliveries stop after six hours. Without this the delivery is durable,
 * queryable and permanently unprocessed.
 *
 * **Why it reads a time band rather than a status.** The obvious query — Linear
 * rows that are `pending` or `failed` — measured at 48.7s on production-shaped
 * data, walking 130k rows and dirtying 311k buffers, and it gets worse as the
 * backlog grows: a job that costs more than its cadence is exactly what #7114
 * had to stop happening. `webhook_events` is 137M rows and 101 GB, so the
 * partial index that would make a status query cheap needs a lock the ingest
 * path cannot afford. What the table does have is an index on `received_at`,
 * and a band of it is a bounded amount of work whatever the backlog looks
 * like: 22.7k rows and 539ms for fifteen minutes of ingest, and it stays that
 * whether there are no abandoned deliveries or ten thousand.
 *
 * The band is read inside `AS MATERIALIZED` on purpose. Without the fence the
 * planner has three ways to answer this and picks a different one depending on
 * how the bounds are written and what the statistics look like that day — one
 * of them being the 48.7s scan. The fence makes `received_at` the only usable
 * predicate, so the cost is the band and nothing else, permanently.
 */
export async function POST(request: Request): Promise<Response> {
	const body = await request.text();
	const rejected = await verifyQstashRequest(request, body, SWEEP_PATH);
	if (rejected) return rejected;

	// One sweep at a time. Two runs overlapping would re-queue the same
	// deliveries twice, and a run is held open across its QStash publishes, so
	// the lock also bounds this route to a single connection.
	const attempt = await singleFlight("linear.sweep-abandoned", async (tx) => {
		const { rows } = await tx.execute<AbandonedRow>(sql`
			WITH band AS MATERIALIZED (
				SELECT id, provider, status, event_id, received_at, retry_count
				FROM ingest.webhook_events
				WHERE received_at >= now() - ${`${ABANDONED_AFTER_MINUTES + BAND_MINUTES} minutes`}::interval
					AND received_at < now() - ${`${ABANDONED_AFTER_MINUTES} minutes`}::interval
			)
			SELECT id, event_id, received_at, retry_count
			FROM band
			WHERE provider = 'linear'
				AND status IN ('pending', 'failed')
				AND left(event_id, ${DELIVERY_PREFIX_LENGTH}) = 'delivery:'
			ORDER BY received_at
			LIMIT ${MAX_ROWS}
		`);

		const plan = planSweep(rows, {
			maxAttempts: MAX_ATTEMPTS,
			maxRequeues: MAX_REQUEUES,
		});

		if (plan.unrecognised.length > 0) {
			console.error(
				"[linear/sweep-abandoned] not delivery rows:",
				plan.unrecognised,
			);
		}

		// Fenced on the state the row was read in, not just its id. A consumer
		// re-queued by an earlier run can still be mid-flight — it has up to
		// `maxDuration` 300s — and commit `processed` between the select above and
		// this update. Writing `abandoned` over that would record the opposite of
		// what happened, and because `abandoned` is a state the consumer refuses,
		// it would also buy a duplicate fan-out from the next redelivery. Under
		// read-committed the predicate is re-checked against the newer row, so the
		// update simply does not land.
		if (plan.exhausted.length > 0) {
			await tx
				.update(webhookEvents)
				.set({
					status: "abandoned",
					error: `Abandoned after ${MAX_ATTEMPTS} attempts`,
				})
				.where(
					and(
						inArray(webhookEvents.id, plan.exhausted),
						inArray(webhookEvents.status, ["pending", "failed"]),
						gte(webhookEvents.retryCount, MAX_ATTEMPTS),
					),
				);
		}

		const requeued: typeof plan.requeue = [];
		const failed: string[] = [];
		let consecutiveFailures = 0;
		for (const { observedRetryCount, ...work } of plan.requeue) {
			try {
				await enqueueLinearDelivery(work);
				requeued.push({ observedRetryCount, ...work });
				consecutiveFailures = 0;
			} catch (error) {
				// Left exactly as it was, so the next run tries it again. Publishing
				// before counting the attempt is deliberate: a re-queue that never
				// happened must not spend one of the delivery's five.
				console.error("[linear/sweep-abandoned] re-queue failed:", error);
				failed.push(work.webhookEventId);
				consecutiveFailures += 1;
				if (consecutiveFailures >= MAX_CONSECUTIVE_PUBLISH_FAILURES) {
					console.error(
						"[linear/sweep-abandoned] giving up this run after",
						consecutiveFailures,
						"consecutive publish failures",
					);
					break;
				}
			}
		}

		// Counted only for deliveries actually handed back to QStash, and only
		// where the row still holds the count it was read at.
		//
		// The consumer increments this same column when it marks a delivery
		// failed, and a consumer started by the first publish of this loop can
		// finish before the last one returns. Without the fence both increments
		// land and one re-queue spends two of the delivery's five attempts — so a
		// delivery gives up early during exactly the incident the attempts exist
		// for. Grouped by the observed count so this stays one statement per
		// distinct value, of which there are at most `MAX_ATTEMPTS`.
		const byObservedCount = new Map<number, string[]>();
		for (const item of requeued) {
			const ids = byObservedCount.get(item.observedRetryCount) ?? [];
			ids.push(item.webhookEventId);
			byObservedCount.set(item.observedRetryCount, ids);
		}
		for (const [observed, ids] of byObservedCount) {
			await tx
				.update(webhookEvents)
				.set({ retryCount: sql`${webhookEvents.retryCount} + 1` })
				.where(
					and(
						inArray(webhookEvents.id, ids),
						inArray(webhookEvents.status, ["pending", "failed"]),
						eq(webhookEvents.retryCount, observed),
					),
				);
		}

		return {
			scanned: rows.length,
			requeued: requeued.length,
			abandoned: plan.exhausted.length,
			failed: failed.length,
			truncated: rows.length === MAX_ROWS,
		};
	});

	// Another run holds the lock. Its band overlaps this one's, so nothing is
	// skipped by standing down.
	if (!attempt.ran) return Response.json({ skipped: "already running" });

	if (attempt.result.requeued > 0 || attempt.result.abandoned > 0) {
		console.log("[linear/sweep-abandoned]", attempt.result);
	}
	return Response.json(attempt.result);
}
