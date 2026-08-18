import { dbWs } from "@superset/db/client";
import {
	automations,
	automationTriggers,
	type TriggerConfig,
} from "@superset/db/schema";
import { nextOccurrenceAfter } from "@superset/shared/rrule";
import { Client, Receiver } from "@upstash/qstash";
import { and, eq, lte } from "drizzle-orm";

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

function bucketToMinute(d: Date): Date {
	const copy = new Date(d.getTime());
	copy.setUTCSeconds(0, 0);
	return copy;
}

/** Null when the config can't drive a schedule, so the caller can fall back. */
function scheduleFromConfig(
	config: TriggerConfig | null,
): { rrule: string; dtstart: Date; timezone: string } | null {
	// The kind-matches-config CHECK passes for jsonb `null` (SQL NULL = NULL is
	// not false), so the column can hold something the type says it can't.
	if (config === null || typeof config !== "object") return null;
	if (config.kind !== "schedule") return null;
	if (!config.rrule || !config.timezone) return null;
	const dtstart = new Date(config.dtstart);
	if (Number.isNaN(dtstart.getTime())) return null;
	return { rrule: config.rrule, dtstart, timezone: config.timezone };
}

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

	const rows = await dbWs
		.select({
			automationId: automations.id,
			nextRunAt: automationTriggers.nextRunAt,
			config: automationTriggers.config,
		})
		.from(automationTriggers)
		.innerJoin(automations, eq(automations.id, automationTriggers.automationId))
		.where(
			and(
				eq(automationTriggers.kind, "schedule"),
				eq(automationTriggers.enabled, true),
				eq(automations.enabled, true),
				lte(automationTriggers.nextRunAt, now),
			),
		)
		.orderBy(automationTriggers.nextRunAt)
		.limit(BATCH_SIZE);

	// `next_run_at <= now` already excludes nulls; this just tells the compiler.
	const due = rows.filter(
		(row): row is (typeof rows)[number] & { nextRunAt: Date } =>
			row.nextRunAt !== null,
	);

	// Work out the next occurrence before dispatching anything: a trigger we
	// can't advance must not be enqueued, or it would fire on every tick forever
	// while its next_run_at stayed put.
	const planned: Array<{
		automationId: string;
		scheduledFor: Date;
		next: Date | null;
	}> = [];
	const unusable: Array<{ automationId: string; reason: string }> = [];

	for (const row of due) {
		const schedule = scheduleFromConfig(row.config);
		if (!schedule) {
			unusable.push({
				automationId: row.automationId,
				reason: "schedule trigger config is unusable",
			});
			continue;
		}
		try {
			planned.push({
				automationId: row.automationId,
				scheduledFor: bucketToMinute(row.nextRunAt),
				next: nextOccurrenceAfter({ ...schedule, after: row.nextRunAt }),
			});
		} catch (error) {
			unusable.push({ automationId: row.automationId, reason: String(error) });
		}
	}

	// Should be empty. These automations are stalled until someone fixes the
	// config, so they need to be loud rather than silently skipped.
	if (unusable.length > 0) {
		console.error(
			"[automations/evaluate] unusable schedule triggers, not dispatched",
			unusable,
		);
	}

	if (planned.length === 0) {
		return Response.json({ enqueued: 0, unusable: unusable.length });
	}

	await qstash.batchJSON(
		planned.map(({ automationId, scheduledFor }) => ({
			url: `${env.NEXT_PUBLIC_API_URL}/api/automations/dispatch/${automationId}`,
			body: {
				automationId,
				scheduledFor: scheduledFor.toISOString(),
			},
			deduplicationId: `${automationId}_${scheduledFor.getTime()}`,
			retries: 2,
			failureCallback: `${env.NEXT_PUBLIC_API_URL}/api/automations/run-failed`,
		})),
	);

	const advanceResults = await Promise.allSettled(
		planned.map(async ({ automationId, next }) => {
			await dbWs
				.update(automationTriggers)
				.set(next ? { nextRunAt: next } : { enabled: false })
				.where(
					and(
						eq(automationTriggers.automationId, automationId),
						eq(automationTriggers.kind, "schedule"),
					),
				);
		}),
	);

	// next_run_at advance failures are recoverable (next tick re-enqueues and
	// QStash dedup absorbs the duplicate), but a persistent failure would
	// hide itself without this log.
	const advanceFailures = advanceResults.flatMap((result, index) => {
		if (result.status !== "rejected") return [];
		return [
			{ automationId: planned[index]?.automationId, reason: result.reason },
		];
	});
	if (advanceFailures.length > 0) {
		console.error(
			"[automations/evaluate] advanceNextRun failures",
			advanceFailures,
		);
	}

	return Response.json({
		enqueued: planned.length,
		advanceFailed: advanceFailures.length,
		unusable: unusable.length,
	});
}
