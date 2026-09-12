import { db } from "@superset/db/client";
import {
	automations,
	automationTriggers,
	subscriptions,
	type TriggerConfig,
} from "@superset/db/schema";
import {
	ACTIVE_SUBSCRIPTION_STATUSES,
	type PlanTier,
	planAllowsTriggerKind,
	planTierFromSubscription,
} from "@superset/shared/billing";
import { nextOccurrenceAfter } from "@superset/shared/rrule";
import { Client } from "@upstash/qstash";
import { and, desc, eq, inArray, lte } from "drizzle-orm";
import { env } from "@/env";
import { redispatchUndispatched } from "@/lib/automations/redispatchUndispatched";
import { singleFlight } from "@/lib/singleFlight";
import { verifyQstashRequest } from "@/lib/verifyQstash";

export const dynamic = "force-dynamic";

const qstash = new Client({
	token: env.QSTASH_TOKEN,
	baseUrl: env.QSTASH_URL,
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

/**
 * The plan of each organization, for the tier gate. One query for the whole
 * batch rather than one per row; the newest paying subscription wins, as it
 * does everywhere else the plan is read.
 */
async function organizationPlans(
	organizationIds: string[],
): Promise<Map<string, PlanTier>> {
	const plans = new Map<string, PlanTier>();
	if (organizationIds.length === 0) return plans;
	const rows = await db
		.select({
			organizationId: subscriptions.referenceId,
			plan: subscriptions.plan,
			status: subscriptions.status,
		})
		.from(subscriptions)
		.where(
			and(
				inArray(subscriptions.referenceId, organizationIds),
				inArray(subscriptions.status, [...ACTIVE_SUBSCRIPTION_STATUSES]),
			),
		)
		.orderBy(desc(subscriptions.createdAt));
	for (const row of rows) {
		if (!plans.has(row.organizationId)) {
			plans.set(row.organizationId, planTierFromSubscription(row));
		}
	}
	return plans;
}

/**
 * One sweep at a time. Ticks arrive every minute whether or not the previous
 * sweep finished, and a sweep that is still going is not worth joining.
 */
async function sweepUndispatched() {
	const sweep = await singleFlight("automations.redispatch", (tx) =>
		redispatchUndispatched(tx),
	);
	return sweep.ran ? sweep.result : { skipped: true };
}

export async function POST(request: Request): Promise<Response> {
	const body = await request.text();
	const rejected = await verifyQstashRequest(
		request,
		body,
		"/api/automations/evaluate",
	);
	if (rejected) return rejected;

	const now = new Date();

	const rows = await db
		.select({
			automationId: automations.id,
			organizationId: automations.organizationId,
			triggerId: automationTriggers.id,
			nextRunAt: automationTriggers.nextRunAt,
			config: automationTriggers.config,
		})
		.from(automationTriggers)
		.innerJoin(automations, eq(automations.id, automationTriggers.automationId))
		.where(
			and(
				eq(automationTriggers.kind, "schedule"),
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

	// Tier gate, same map the editor badges from: a downgraded org's schedules
	// stay configured and keep advancing, they just never fire. Advancing keeps
	// the row current, so an upgrade resumes at the next occurrence instead of
	// replaying a backlog of missed ones.
	const plans = await organizationPlans([
		...new Set(due.map((row) => row.organizationId)),
	]);
	const belowPlan = (organizationId: string) =>
		!planAllowsTriggerKind(plans.get(organizationId) ?? "free", "schedule");

	// Work out the next occurrence before dispatching anything: a trigger we
	// can't advance must not be enqueued, or it would fire on every tick forever
	// while its next_run_at stayed put.
	const planned: Array<{
		automationId: string;
		triggerId: string;
		scheduledFor: Date;
		next: Date | null;
		enqueue: boolean;
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
				triggerId: row.triggerId,
				scheduledFor: bucketToMinute(row.nextRunAt),
				next: nextOccurrenceAfter({ ...schedule, after: row.nextRunAt }),
				enqueue: !belowPlan(row.organizationId),
			});
		} catch (error) {
			unusable.push({ automationId: row.automationId, reason: String(error) });
		}
	}
	const toEnqueue = planned.filter((entry) => entry.enqueue);
	const skippedByPlan = planned.length - toEnqueue.length;

	// Should be empty. These automations are stalled until someone fixes the
	// config, so they need to be loud rather than silently skipped.
	if (unusable.length > 0) {
		console.error(
			"[automations/evaluate] unusable schedule triggers, not dispatched",
			unusable,
		);
	}

	if (planned.length === 0) {
		// The event-handoff sweep still runs on a tick with no due schedules.
		const redispatched = await sweepUndispatched();
		return Response.json({
			enqueued: 0,
			unusable: unusable.length,
			redispatched,
		});
	}

	if (toEnqueue.length > 0) {
		await qstash.batchJSON(
			toEnqueue.map(({ automationId, triggerId, scheduledFor }) => ({
				url: `${env.NEXT_PUBLIC_API_URL}/api/automations/dispatch/${automationId}`,
				body: {
					automationId,
					triggerId,
					scheduledFor: scheduledFor.toISOString(),
				},
				deduplicationId: `${automationId}_${scheduledFor.getTime()}`,
				retries: 2,
				failureCallback: `${env.NEXT_PUBLIC_API_URL}/api/automations/run-failed`,
			})),
		);
	}

	const advanceResults = await Promise.allSettled(
		planned.map(async ({ triggerId, next }) => {
			await db
				.update(automationTriggers)
				// Always a date for rules the product accepts (finite recurrences
				// are refused at save); legacy finite data writes null and simply
				// leaves the select, which reads only set next_run_at.
				.set({ nextRunAt: next })
				.where(eq(automationTriggers.id, triggerId));
		}),
	);

	// next_run_at advance failures are recoverable (next tick re-enqueues and
	// QStash dedup absorbs the duplicate), but a persistent failure would
	// hide itself without this log.
	const advanceFailures = advanceResults.flatMap((result, index) => {
		if (result.status !== "rejected") return [];
		return [
			{
				automationId: planned[index]?.automationId,
				triggerId: planned[index]?.triggerId,
				reason: result.reason,
			},
		];
	});
	if (advanceFailures.length > 0) {
		console.error(
			"[automations/evaluate] advanceNextRun failures",
			advanceFailures,
		);
	}

	// The same tick retries event handoffs that never reached QStash.
	const redispatched = await sweepUndispatched();

	return Response.json({
		enqueued: toEnqueue.length,
		skippedByPlan,
		advanceFailed: advanceFailures.length,
		unusable: unusable.length,
		redispatched,
	});
}
