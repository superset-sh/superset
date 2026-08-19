import { db } from "@superset/db/client";
import type { SelectIntegrationConnection } from "@superset/db/schema";
import {
	eventEnd,
	eventStart,
	findGoogleConnectionById,
	type GoogleCalendarEvent,
	getEvent,
} from "@superset/trpc/integrations/google";
import { z } from "zod";
import {
	ingestAutomationEvent,
	type NormalizedDelivery,
} from "@/lib/automations/ingestAutomationEvent";
import { verifyQstashRequest } from "@/lib/verifyQstash";
import {
	accountDomain,
	calendarPayload,
	matchableCalendarEvent,
	resourceKeyFor,
} from "../../lib/calendarEvents";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

const fireSchema = z.object({
	connectionId: z.string().uuid(),
	calendarId: z.string().min(1),
	eventId: z.string().min(1),
	fire: z.enum(["starting_soon", "ended"]),
	minutesBefore: z.number().int().positive().nullable(),
	expectedAt: z.string().datetime(),
});

/**
 * A `starting_soon` or `ended` fire, delivered by QStash at the moment it was
 * scheduled for. The event is read again before anything is recorded: if it
 * was moved or cancelled after the fire was scheduled, this delivery is stale
 * and the sweep has (or will have) scheduled the right one.
 */
export async function POST(request: Request) {
	const body = await request.text();
	const rejected = await verifyQstashRequest(
		request,
		body,
		"/api/integrations/google/calendar/scheduled",
	);
	if (rejected) return rejected;

	const parsed = fireSchema.safeParse(JSON.parse(body));
	if (!parsed.success) {
		return Response.json({ error: "Invalid payload" }, { status: 400 });
	}
	const fire = parsed.data;

	const connection = await findGoogleConnectionById(fire.connectionId);
	if (!connection || connection.disconnectedAt) {
		return Response.json({ ok: true, skipped: "disconnected" });
	}

	const event = await getEvent(connection.id, fire.calendarId, fire.eventId);
	if (!event || event.status === "cancelled") {
		return Response.json({ ok: true, skipped: "cancelled" });
	}
	const anchor =
		fire.fire === "starting_soon" ? eventStart(event) : eventEnd(event);
	if (
		!anchor ||
		anchor.toISOString() !== new Date(fire.expectedAt).toISOString()
	) {
		return Response.json({ ok: true, skipped: "moved" });
	}

	const outcome = await ingestAutomationEvent(
		db,
		normalizeFire(connection, fire, event),
	);
	if (outcome.status === "duplicate") {
		return Response.json({ ok: true, skipped: "duplicate" });
	}
	return Response.json({ ok: true, ...outcome });
}

function normalizeFire(
	connection: SelectIntegrationConnection,
	fire: z.infer<typeof fireSchema>,
	event: GoogleCalendarEvent,
): NormalizedDelivery {
	const eventType =
		fire.fire === "starting_soon" ? "event.starting_soon" : "event.ended";
	const matchable = matchableCalendarEvent({
		eventType,
		calendarId: fire.calendarId,
		event,
		domain: accountDomain(connection),
		minutesBefore: fire.minutesBefore ?? undefined,
	});
	return {
		event: {
			organizationId: connection.organizationId,
			integrationConnectionId: connection.id,
			provider: "google_calendar",
			eventType,
			externalEventId: `${fire.calendarId}:${fire.eventId}:${fire.expectedAt}:${fire.fire}:${fire.minutesBefore ?? ""}`,
			resourceKey: resourceKeyFor(connection.id, fire.calendarId, fire.eventId),
			title: event.summary ?? fire.eventId,
			url: event.htmlLink ?? null,
			actorLogin: event.organizer?.email?.toLowerCase() ?? null,
			actorIsExternal: matchable.hasExternalAttendee,
			payload: calendarPayload(fire.calendarId, event, matchable, {
				fire: fire.fire,
				minutesBefore: fire.minutesBefore,
				expectedAt: fire.expectedAt,
			}),
		},
		// The connection is one member's calendar, so only that member's
		// automations may match its events.
		dispatch: { event: matchable, ownerUserId: connection.connectedByUserId },
	};
}
