import { dbWs } from "@superset/db/client";
import { automations } from "@superset/db/schema";
import { bucketToMinute, nextOccurrenceAfter } from "@superset/shared/rrule";
import { Client, Receiver } from "@upstash/qstash";
import { and, eq, getTableColumns, lte, sql } from "drizzle-orm";

import { env } from "@/env";

export const dynamic = "force-dynamic";

const qstash = new Client({
	token: env.QSTASH_TOKEN,
	baseUrl: env.QSTASH_URL,
});
const receiver = new Receiver({
	currentSigningKey: env.QSTASH_CURRENT_SIGNING_KEY,
	nextSigningKey: env.QSTASH_NEXT_SIGNING_KEY,
});

const BATCH_SIZE = 2000;

export async function POST(request: Request): Promise<Response> {
	const body = await request.text();
	const signature = request.headers.get("upstash-signature");
	if (!signature) {
		return Response.json({ error: "Missing signature" }, { status: 401 });
	}

	const valid = await receiver.verify({
		body,
		signature,
		url: `${env.NEXT_PUBLIC_API_URL}/api/automations/evaluate`,
	});
	if (!valid) {
		return Response.json({ error: "Invalid signature" }, { status: 401 });
	}

	const now = new Date();
	const due = await dbWs
		.select({
			...getTableColumns(automations),
			// Keep the database's full timestamp precision in a signed ISO token.
			updatedAtToken: sql<string>`to_char(${automations.updatedAt} AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`,
		})
		.from(automations)
		.where(and(eq(automations.enabled, true), lte(automations.nextRunAt, now)))
		.orderBy(automations.nextRunAt)
		.limit(BATCH_SIZE);

	if (due.length === 0) {
		return Response.json({ enqueued: 0 });
	}

	const dueWithNext = due.map((automation) => {
		const next = nextOccurrenceAfter({
			rrule: automation.rrule,
			dtstart: automation.dtstart,
			timezone: automation.timezone,
			after: automation.nextRunAt,
		});
		// Derive the token from the occurrence so concurrent evaluators produce
		// the same signed payload and idempotent reservation value.
		const terminalDispatchToken =
			next === null ? new Date(automation.nextRunAt.getTime() + 1) : undefined;
		return {
			automation,
			next,
			terminalDispatchToken,
		};
	});

	await qstash.batchJSON(
		dueWithNext.map(({ automation, next, terminalDispatchToken }) => {
			const scheduledFor = bucketToMinute(automation.nextRunAt);
			return {
				url: `${env.NEXT_PUBLIC_API_URL}/api/automations/dispatch/${automation.id}`,
				body: {
					automationId: automation.id,
					scheduledFor: scheduledFor.toISOString(),
					terminal: next === null,
					terminalDispatchToken: terminalDispatchToken?.toISOString(),
					terminalPreviousUpdatedAt:
						next === null ? automation.updatedAtToken : undefined,
				},
				deduplicationId: `${automation.id}_${scheduledFor.getTime()}`,
				retries: 2,
				failureCallback: `${env.NEXT_PUBLIC_API_URL}/api/automations/run-failed`,
			};
		}),
	);

	const advanceResults = await Promise.allSettled(
		dueWithNext.map(({ automation, next, terminalDispatchToken }) => {
			if (!next) {
				if (!terminalDispatchToken) {
					throw new Error("Missing terminal dispatch token");
				}

				// Keep nextRunAt as the real occurrence for API/UI consumers. The
				// updatedAt token records that this disabled row belongs to the
				// evaluator's queued terminal occurrence.
				return dbWs
					.update(automations)
					.set({ enabled: false, updatedAt: terminalDispatchToken })
					.where(
						and(
							eq(automations.id, automation.id),
							eq(automations.enabled, true),
							eq(automations.nextRunAt, automation.nextRunAt),
							sql`${automations.updatedAt} = ${automation.updatedAtToken}::timestamptz`,
						),
					);
			}

			return dbWs
				.update(automations)
				.set({ nextRunAt: next })
				.where(eq(automations.id, automation.id));
		}),
	);

	// next_run_at advance failures are recoverable (next tick re-enqueues and
	// QStash dedup absorbs the duplicate), but a persistent failure would
	// hide itself without this log.
	const advanceFailures = advanceResults.flatMap((result, index) => {
		if (result.status !== "rejected") return [];
		const automation = due[index];
		return [{ automationId: automation?.id, reason: result.reason }];
	});
	if (advanceFailures.length > 0) {
		console.error(
			"[automations/evaluate] advanceNextRun failures",
			advanceFailures,
		);
	}

	return Response.json({
		enqueued: due.length,
		advanceFailed: advanceFailures.length,
	});
}
