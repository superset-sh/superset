import { db } from "@superset/db/client";
import { automations, automationTriggers } from "@superset/db/schema";
import {
	findGoogleConnection,
	googleConfigOf,
	listUpcomingInstances,
} from "@superset/trpc/integrations/google";
import { and, eq, inArray, sql } from "drizzle-orm";
import { verifyQstashRequest } from "@/lib/verifyQstash";
import {
	loadFirePlan,
	scheduleFires,
	sweepWindow,
} from "../../lib/scheduleCalendarFires";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

/**
 * Every fifteen minutes: for each member with an enabled `starting_soon` or
 * `ended` trigger and a Google connection, list the instances due inside the
 * fire horizon on every watched calendar and hand their fires to QStash. This is what catches
 * triggers created after the event was synced, and recurring instances the
 * incremental sync never sees individually.
 */
export async function POST(request: Request) {
	const body = await request.text();
	const rejected = await verifyQstashRequest(
		request,
		body,
		"/api/integrations/google/jobs/sweep-schedules",
	);
	if (rejected) return rejected;

	const owners = await db
		.selectDistinct({
			organizationId: automationTriggers.organizationId,
			ownerUserId: automations.ownerUserId,
		})
		.from(automationTriggers)
		.innerJoin(automations, eq(automations.id, automationTriggers.automationId))
		.where(
			and(
				eq(automationTriggers.kind, "google_calendar"),
				eq(automations.enabled, true),
				inArray(sql`${automationTriggers.config}->>'event'`, [
					"event.starting_soon",
					"event.ended",
				]),
			),
		);

	const now = new Date();
	const results = [];
	for (const { organizationId, ownerUserId } of owners) {
		try {
			const connection = await findGoogleConnection(
				organizationId,
				ownerUserId,
			);
			const plan = await loadFirePlan(organizationId, ownerUserId);
			if (!connection || !plan) continue;
			const window = sweepWindow(plan, now);
			let scheduled = 0;
			for (const calendarId of Object.keys(
				googleConfigOf(connection.config).calendars ?? {},
			)) {
				if (!plan.allows(calendarId)) continue;
				const instances = await listUpcomingInstances(
					connection.id,
					calendarId,
					window,
				);
				scheduled += await scheduleFires({
					connectionId: connection.id,
					calendarId,
					instances,
					plan,
					now,
				});
			}
			results.push({ organizationId, ownerUserId, scheduled });
		} catch (error) {
			console.error(
				`[google/sweep-schedules] ${organizationId}/${ownerUserId} failed:`,
				error,
			);
			results.push({
				organizationId,
				ownerUserId,
				error: error instanceof Error ? error.message : String(error),
			});
		}
	}
	return Response.json({ owners: owners.length, results });
}
