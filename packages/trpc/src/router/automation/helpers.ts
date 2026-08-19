import { createHash } from "node:crypto";
import { db, type dbWs } from "@superset/db/client";
import {
	type AutomationPromptSource,
	automationPromptVersions,
	automations,
	automationTriggers,
	type ScheduleTriggerConfig,
	type TriggerConfig,
} from "@superset/db/schema";
import { nextOccurrenceAfter } from "@superset/shared/rrule";
import { TRPCError } from "@trpc/server";
import { and, eq, inArray, sql } from "drizzle-orm";

const PROMPT_VERSION_BUCKET_SECONDS = 600;

export function computePromptHash(prompt: string): string {
	return createHash("sha256").update(prompt).digest("hex");
}

export function currentPromptWindowBucket(): number {
	return Math.floor(Date.now() / 1000 / PROMPT_VERSION_BUCKET_SECONDS);
}

export function promptSourceFromSession(session: {
	session: { userAgent: string | null };
}): AutomationPromptSource {
	return session.session.userAgent === "mcp-v2" ? "agent" : "human";
}

export type AutomationDbExecutor =
	| typeof dbWs
	| Parameters<Parameters<typeof dbWs.transaction>[0]>[0];

/**
 * Mirrors an automation's schedule onto its `schedule` trigger. The dispatcher
 * reads triggers; the legacy `automations` columns stay written until they drop,
 * so a revert of this code is a clean revert.
 */
export async function syncScheduleTrigger(
	tx: AutomationDbExecutor,
	params: {
		automationId: string;
		organizationId: string;
		rrule: string;
		dtstart: Date;
		timezone: string;
		nextRunAt: Date | null;
	},
) {
	const config: ScheduleTriggerConfig = {
		kind: "schedule",
		rrule: params.rrule,
		dtstart: params.dtstart.toISOString(),
		timezone: params.timezone,
	};

	// The legacy shape describes exactly one schedule, so it replaces whatever
	// schedules the automation has. ON CONFLICT is no longer available — the
	// partial unique index it inferred is gone now that several are allowed —
	// and the surviving row is updated rather than recreated so the runs
	// pointing at it keep their attribution.
	const existing = await tx
		.select({ id: automationTriggers.id })
		.from(automationTriggers)
		.where(
			and(
				eq(automationTriggers.automationId, params.automationId),
				eq(automationTriggers.kind, "schedule"),
			),
		)
		.orderBy(automationTriggers.createdAt, automationTriggers.id);

	const [keep, ...extra] = existing;

	if (!keep) {
		await tx.insert(automationTriggers).values({
			automationId: params.automationId,
			organizationId: params.organizationId,
			kind: "schedule",
			config,
			nextRunAt: params.nextRunAt,
		});
		return;
	}

	await tx
		.update(automationTriggers)
		.set({ config, nextRunAt: params.nextRunAt })
		.where(eq(automationTriggers.id, keep.id));

	if (extra.length > 0) {
		await tx.delete(automationTriggers).where(
			inArray(
				automationTriggers.id,
				extra.map((row) => row.id),
			),
		);
	}
}

/**
 * Recomputes every schedule's next run from now.
 *
 * Used when resuming: occurrences pile up while an automation is paused, and
 * firing them on resume would run the backlog. Each schedule advances on its
 * own recurrence — collapsing them to one would delete the others.
 *
 * Trigger `enabled` is left alone. The dispatcher already gates on
 * `automations.enabled`, so pausing does not depend on it, and overwriting it
 * would silently re-enable a trigger someone turned off by hand.
 */
export async function refreshScheduleNextRuns(
	tx: AutomationDbExecutor,
	automationId: string,
) {
	const schedules = await tx
		.select({
			id: automationTriggers.id,
			config: automationTriggers.config,
		})
		.from(automationTriggers)
		.where(
			and(
				eq(automationTriggers.automationId, automationId),
				eq(automationTriggers.kind, "schedule"),
			),
		);

	for (const schedule of schedules) {
		if (schedule.config.kind !== "schedule") continue;
		const { rrule, dtstart, timezone } = schedule.config;

		let nextRunAt: Date | null = null;
		try {
			nextRunAt = nextOccurrenceAfter({
				rrule,
				dtstart: new Date(dtstart),
				timezone,
				after: new Date(),
			});
		} catch {
			// An unusable recurrence leaves next_run_at null, which the dispatcher
			// skips — better than resuming into a rule that cannot advance.
		}

		await tx
			.update(automationTriggers)
			.set({ nextRunAt })
			.where(eq(automationTriggers.id, schedule.id));
	}
}

export async function recordPromptVersion(
	tx: AutomationDbExecutor,
	params: {
		automationId: string;
		authorUserId: string;
		content: string;
		source: AutomationPromptSource;
		restoredFromVersionId?: string | null;
	},
) {
	const contentHash = computePromptHash(params.content);
	const windowBucket = currentPromptWindowBucket();

	const insert = tx.insert(automationPromptVersions).values({
		automationId: params.automationId,
		authorUserId: params.authorUserId,
		windowBucket,
		content: params.content,
		contentHash,
		source: params.source,
		restoredFromVersionId: params.restoredFromVersionId ?? null,
	});

	if (params.source === "restore") {
		const [row] = await insert.returning();
		return row;
	}

	const [row] = await insert
		.onConflictDoUpdate({
			target: [
				automationPromptVersions.automationId,
				automationPromptVersions.authorUserId,
				automationPromptVersions.windowBucket,
			],
			targetWhere: sql`${automationPromptVersions.source} <> 'restore'`,
			set: {
				content: sql`excluded.content`,
				contentHash: sql`excluded.content_hash`,
				source: sql`excluded.source`,
				updatedAt: sql`now()`,
			},
		})
		.returning();
	return row;
}

/**
 * The schedule fields the API has always exposed, now meaning *the soonest*
 * schedule — an automation may carry several.
 *
 * Derived in JS from the trigger rows rather than joined. A join to a table
 * that can hold more than one matching row per automation fans out: `list`
 * would repeat the automation once per schedule, and `get` would pick an
 * arbitrary one. It also retires a trap — the joined `dtstart` was a computed
 * expression carrying no column type, so it needed `mapWith` to come back as a
 * Date rather than a string.
 */
export type ScheduleSummary = {
	rrule: string | null;
	dtstart: Date | null;
	timezone: string | null;
	nextRunAt: Date | null;
};

export const NO_SCHEDULE: ScheduleSummary = {
	rrule: null,
	dtstart: null,
	timezone: null,
	nextRunAt: null,
};

type TriggerRow = {
	kind: string;
	config: TriggerConfig;
	nextRunAt: Date | null;
};

/**
 * The schedule that fires next. A schedule with no `next_run_at` — unusable
 * recurrence, or never advanced — sorts last rather than winning by being null.
 */
export function summarizeSchedules(triggers: TriggerRow[]): ScheduleSummary {
	const schedules = triggers.filter(
		(t) => t.kind === "schedule" && t.config.kind === "schedule",
	);
	if (schedules.length === 0) return NO_SCHEDULE;

	const soonest = schedules.reduce((best, candidate) => {
		if (!best.nextRunAt) return candidate;
		if (!candidate.nextRunAt) return best;
		return candidate.nextRunAt < best.nextRunAt ? candidate : best;
	});

	const config = soonest.config as ScheduleTriggerConfig;
	return {
		rrule: config.rrule,
		dtstart: new Date(config.dtstart),
		timezone: config.timezone,
		nextRunAt: soonest.nextRunAt,
	};
}

/** Schedule summaries for many automations, keyed by automation id. */
export async function scheduleSummariesFor(
	automationIds: string[],
): Promise<Map<string, ScheduleSummary>> {
	if (automationIds.length === 0) return new Map();

	const rows = await db
		.select({
			automationId: automationTriggers.automationId,
			kind: automationTriggers.kind,
			config: automationTriggers.config,
			nextRunAt: automationTriggers.nextRunAt,
		})
		.from(automationTriggers)
		.where(
			and(
				inArray(automationTriggers.automationId, automationIds),
				eq(automationTriggers.kind, "schedule"),
			),
		);

	const byAutomation = new Map<string, TriggerRow[]>();
	for (const row of rows) {
		const list = byAutomation.get(row.automationId) ?? [];
		list.push(row);
		byAutomation.set(row.automationId, list);
	}

	return new Map(
		automationIds.map((id) => [
			id,
			summarizeSchedules(byAutomation.get(id) ?? []),
		]),
	);
}

/**
 * Automation columns minus the ones the schedule trigger supplies, and minus
 * `prompt` (large markdown — `getPrompt` fetches it). Listed explicitly so the
 * response shape is visible and the dropped schedule columns can't creep back.
 */
export const automationBaseColumns = {
	id: automations.id,
	organizationId: automations.organizationId,
	ownerUserId: automations.ownerUserId,
	name: automations.name,
	agent: automations.agent,
	targetHostId: automations.targetHostId,
	v2ProjectId: automations.v2ProjectId,
	v2WorkspaceId: automations.v2WorkspaceId,
	enabled: automations.enabled,
	createdAt: automations.createdAt,
	updatedAt: automations.updatedAt,
};

export async function getAutomationForUser(
	userId: string,
	organizationId: string,
	id: string,
) {
	const [automation] = await db
		.select({ ...automationBaseColumns, prompt: automations.prompt })
		.from(automations)
		.where(
			and(
				eq(automations.id, id),
				eq(automations.organizationId, organizationId),
			),
		)
		.limit(1);

	if (!automation || automation.ownerUserId !== userId) {
		throw new TRPCError({
			code: "NOT_FOUND",
			message: "Automation not found",
		});
	}

	const summaries = await scheduleSummariesFor([automation.id]);
	return { ...automation, ...(summaries.get(automation.id) ?? NO_SCHEDULE) };
}
