import { automationTriggers, type TriggerConfig } from "@superset/db/schema";
import {
	type DraftTrigger,
	describeTriggerProblems,
	summarizeTriggerProblems,
} from "@superset/shared/automation-triggers";
import { LAUNCHED_TRIGGER_KINDS } from "@superset/shared/constants";
import { nextOccurrenceAfter } from "@superset/shared/rrule";
import { TRPCError } from "@trpc/server";
import { and, eq, inArray, notInArray } from "drizzle-orm";

import type { AutomationDbExecutor } from "./helpers";

/** Schedules carry their next firing time in a column so the dispatcher can
 * index it. Event triggers fire on arrival and have none. */
function nextRunAtFor(config: DraftTrigger["config"]): Date | null {
	if (config.kind !== "schedule") return null;
	return nextOccurrenceAfter({
		rrule: config.rrule,
		dtstart: new Date(config.dtstart),
		timezone: config.timezone,
		after: new Date(),
	});
}

function recurrenceChanged(
	next: DraftTrigger["config"],
	previous: TriggerConfig | null,
): boolean {
	if (next.kind !== "schedule") return false;
	if (!previous || previous.kind !== "schedule") return true;
	return (
		previous.rrule !== next.rrule ||
		previous.dtstart !== next.dtstart ||
		previous.timezone !== next.timezone
	);
}

/**
 * Replaces an automation's triggers with `triggers`, in place.
 *
 * Rows are matched by id rather than cleared and reinserted, because a trigger
 * row carries state the editor never sees: a webhook's signing key, and a
 * schedule's next run. Recreating them would silently roll the key someone
 * already configured upstream, and reschedule an automation that was only
 * renamed.
 */
export async function saveTriggerSet(
	tx: AutomationDbExecutor,
	params: {
		automationId: string;
		organizationId: string;
		triggers: DraftTrigger[];
	},
) {
	// The schema accepts every kind that exists in code; this list is which of
	// them have launched. The PostHog payload only hides menu entries, so the
	// server has to be the one refusing an unlaunched kind.
	const launched: ReadonlySet<string> = new Set(LAUNCHED_TRIGGER_KINDS);
	for (const trigger of params.triggers) {
		if (!launched.has(trigger.config.kind)) {
			throw new TRPCError({
				code: "BAD_REQUEST",
				message: `${trigger.config.kind} triggers are not available`,
			});
		}
	}

	const problems = describeTriggerProblems(params.triggers);
	if (problems.length > 0) {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message:
				summarizeTriggerProblems(problems) ?? "Triggers are not configured",
			cause: problems,
		});
	}

	const existing = await tx
		.select({
			id: automationTriggers.id,
			config: automationTriggers.config,
			nextRunAt: automationTriggers.nextRunAt,
		})
		.from(automationTriggers)
		.where(eq(automationTriggers.automationId, params.automationId));
	const existingById = new Map(existing.map((row) => [row.id, row]));

	const keptIds = params.triggers.flatMap((t) =>
		t.id && existingById.has(t.id) ? [t.id] : [],
	);

	// Anything the editor dropped. Scoped to this automation, so a stray id from
	// another automation can never widen the delete.
	await tx
		.delete(automationTriggers)
		.where(
			keptIds.length > 0
				? and(
						eq(automationTriggers.automationId, params.automationId),
						notInArray(automationTriggers.id, keptIds),
					)
				: eq(automationTriggers.automationId, params.automationId),
		);

	const saved: string[] = [];
	for (const trigger of params.triggers) {
		const previous = trigger.id ? existingById.get(trigger.id) : undefined;
		const config = trigger.config as TriggerConfig;

		if (previous) {
			// Only recompute the next run when the recurrence actually moved;
			// otherwise renaming an automation would reschedule it.
			const nextRunAt = recurrenceChanged(trigger.config, previous.config)
				? nextRunAtFor(trigger.config)
				: previous.nextRunAt;

			const [row] = await tx
				.update(automationTriggers)
				.set({ config, nextRunAt })
				.where(eq(automationTriggers.id, previous.id))
				.returning({ id: automationTriggers.id });
			if (row) saved.push(row.id);
			continue;
		}

		const [row] = await tx
			.insert(automationTriggers)
			.values({
				automationId: params.automationId,
				organizationId: params.organizationId,
				kind: config.kind,
				config,
				nextRunAt: nextRunAtFor(trigger.config),
			})
			.returning({ id: automationTriggers.id });
		if (row) saved.push(row.id);
	}

	return tx
		.select()
		.from(automationTriggers)
		.where(inArray(automationTriggers.id, saved));
}
