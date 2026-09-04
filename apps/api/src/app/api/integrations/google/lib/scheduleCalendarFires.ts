import { createHash } from "node:crypto";
import { db } from "@superset/db/client";
import { automations, automationTriggers } from "@superset/db/schema";
import { scopeAllows } from "@superset/shared/automation-matching";
import type { TriggerScope } from "@superset/shared/automation-triggers";
import {
	eventEnd,
	eventStart,
	type GoogleCalendarEvent,
} from "@superset/trpc/integrations/google";
import { Client } from "@upstash/qstash";
import { and, eq, inArray, sql } from "drizzle-orm";
import { env } from "@/env";

const qstash = new Client({
	token: env.QSTASH_TOKEN,
	baseUrl: env.QSTASH_URL,
});

/**
 * How far ahead a fire is handed to QStash. The sweep runs every fifteen
 * minutes; anything due inside this window is scheduled by it, so the horizon
 * only has to outlast one sweep interval plus slack. Keeping it short means a
 * moved or cancelled event has at most one stale fire outstanding, and that
 * one is caught by the callback re-reading the event.
 */
export const FIRE_HORIZON_MS = 35 * 60 * 1000;

/** A fire scheduled a moment late is still worth firing; older ones are not. */
const LATE_TOLERANCE_MS = 60 * 1000;

/**
 * What one member's enabled triggers want fired, so the sweep lists only as
 * far ahead as the longest lead time and schedules nothing nobody asked for.
 * Per owner because a Google connection is one member's: their automations
 * are the only ones that will ever match fires off it.
 */
export async function loadFirePlan(
	organizationId: string,
	ownerUserId: string,
): Promise<{
	minutesBefore: number[];
	ended: boolean;
	allows: (calendarId: string) => boolean;
} | null> {
	const rows = await db
		.select({ config: automationTriggers.config })
		.from(automationTriggers)
		.innerJoin(automations, eq(automations.id, automationTriggers.automationId))
		.where(
			and(
				eq(automationTriggers.organizationId, organizationId),
				eq(automations.ownerUserId, ownerUserId),
				eq(automationTriggers.kind, "google_calendar"),
				eq(automations.enabled, true),
				inArray(sql`${automationTriggers.config}->>'event'`, [
					"event.starting_soon",
					"event.ended",
				]),
			),
		);
	if (rows.length === 0) return null;

	const minutesBefore = new Set<number>();
	let ended = false;
	const scopes: TriggerScope[] = [];
	for (const row of rows) {
		const config = row.config;
		if (config.kind !== "google_calendar") continue;
		scopes.push(config.calendars);
		if (config.event === "event.starting_soon") {
			minutesBefore.add(config.minutesBefore);
		}
		if (config.event === "event.ended") ended = true;
	}
	return {
		minutesBefore: [...minutesBefore],
		ended,
		allows: (calendarId) => scopes.some((s) => scopeAllows(s, calendarId)),
	};
}

export type ScheduledFire = {
	connectionId: string;
	calendarId: string;
	eventId: string;
	fire: "starting_soon" | "ended";
	minutesBefore: number | null;
	/** The start (or end) the fire was computed from; re-checked when it lands. */
	expectedAt: string;
};

/**
 * Hands QStash every fire due within the horizon for these instances.
 *
 * Idempotency is layered: the deduplication id stops QStash holding two copies
 * of one fire at once, and the `automation_events` unique index stops a second
 * delivery of the same fire recording twice.
 */
export async function scheduleFires(params: {
	connectionId: string;
	calendarId: string;
	instances: GoogleCalendarEvent[];
	plan: NonNullable<Awaited<ReturnType<typeof loadFirePlan>>>;
	now?: Date;
}): Promise<number> {
	if (!params.plan.allows(params.calendarId)) return 0;
	const now = params.now ?? new Date();
	const fires: Array<{ fire: ScheduledFire; at: Date }> = [];

	for (const instance of params.instances) {
		if (instance.status === "cancelled") continue;
		// All-day events carry a date and no time; "starting soon" has no
		// meaning for them and "ended" would fire at a timezone's midnight.
		const start = eventStart(instance);
		const end = eventEnd(instance);
		if (!start || !end) continue;

		for (const minutesBefore of params.plan.minutesBefore) {
			const at = new Date(start.getTime() - minutesBefore * 60_000);
			if (!withinHorizon(at, now)) continue;
			fires.push({
				at,
				fire: {
					connectionId: params.connectionId,
					calendarId: params.calendarId,
					eventId: instance.id,
					fire: "starting_soon",
					minutesBefore,
					expectedAt: start.toISOString(),
				},
			});
		}
		if (params.plan.ended && withinHorizon(end, now)) {
			fires.push({
				at: end,
				fire: {
					connectionId: params.connectionId,
					calendarId: params.calendarId,
					eventId: instance.id,
					fire: "ended",
					minutesBefore: null,
					expectedAt: end.toISOString(),
				},
			});
		}
	}

	if (fires.length === 0) return 0;

	await qstash.batchJSON(
		fires.map(({ fire, at }) => ({
			url: `${env.NEXT_PUBLIC_API_URL}/api/integrations/google/calendar/scheduled`,
			body: fire,
			notBefore: Math.max(
				Math.floor(at.getTime() / 1000),
				Math.floor(now.getTime() / 1000),
			),
			deduplicationId: fireDedupId(fire),
			retries: 2,
		})),
	);
	return fires.length;
}

function withinHorizon(at: Date, now: Date): boolean {
	const delta = at.getTime() - now.getTime();
	return delta >= -LATE_TOLERANCE_MS && delta <= FIRE_HORIZON_MS;
}

/** Stable across sweeps for the same fire, and short enough for QStash. */
export function fireDedupId(fire: ScheduledFire): string {
	return createHash("sha256")
		.update(
			[
				fire.connectionId,
				fire.calendarId,
				fire.eventId,
				fire.fire,
				String(fire.minutesBefore ?? ""),
				fire.expectedAt,
			].join("|"),
		)
		.digest("hex")
		.slice(0, 48);
}

/** The listing window a sweep needs so every fire in the horizon is seen. */
export function sweepWindow(
	plan: { minutesBefore: number[] },
	now: Date,
): { from: Date; to: Date } {
	const maxLead = Math.max(0, ...plan.minutesBefore) * 60_000;
	return {
		from: new Date(now.getTime() - LATE_TOLERANCE_MS),
		to: new Date(now.getTime() + FIRE_HORIZON_MS + maxLead),
	};
}
