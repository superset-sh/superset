import type { SelectIntegrationConnection } from "@superset/db/schema";
import type { GoogleCalendarMatchableEvent } from "@superset/shared/automation-matching";
import type { GoogleCalendarTriggerEvent } from "@superset/shared/automation-triggers";
import {
	eventAttendeeEmails,
	type GoogleCalendarEvent,
} from "@superset/trpc/integrations/google";

/** The domain of the connected account: what "external" is measured against. */
export function accountDomain(
	connection: Pick<SelectIntegrationConnection, "externalOrgId">,
): string | null {
	const at = connection.externalOrgId?.lastIndexOf("@") ?? -1;
	if (at < 0) return null;
	return connection.externalOrgId?.slice(at + 1).toLowerCase() ?? null;
}

export function resourceKeyFor(
	connectionId: string,
	calendarId: string,
	eventId: string,
): string {
	return `google_calendar:${connectionId}:${calendarId}:${eventId}`;
}

/**
 * What triggers filter on, pulled out of a Google event once. The same
 * function serves synced changes and the fires scheduled off them.
 */
export function matchableCalendarEvent(params: {
	eventType: GoogleCalendarTriggerEvent;
	calendarId: string;
	event: GoogleCalendarEvent;
	domain: string | null;
	minutesBefore?: number;
}): GoogleCalendarMatchableEvent {
	const attendeeEmails = eventAttendeeEmails(params.event);
	const organizer = params.event.organizer?.email?.toLowerCase() ?? null;
	return {
		provider: "google_calendar",
		eventType: params.eventType,
		actorId: organizer,
		actorLogin: organizer,
		body: params.event.description ?? null,
		calendarId: params.calendarId,
		attendeeEmails,
		title: params.event.summary ?? null,
		// Unknown domain means "external" cannot be judged; false rather than
		// everyone, so an external-attendee trigger does not fire on every event.
		hasExternalAttendee:
			params.domain !== null &&
			attendeeEmails.some((email) => !email.endsWith(`@${params.domain}`)),
		minutesBefore: params.minutesBefore ?? null,
	};
}

/** The row payload: the event as Google sent it plus what was derived. */
export function calendarPayload(
	calendarId: string,
	event: GoogleCalendarEvent,
	matchable: GoogleCalendarMatchableEvent,
	extra: Record<string, unknown> = {},
): Record<string, unknown> {
	return {
		calendarId,
		event,
		attendeeEmails: matchable.attendeeEmails,
		hasExternalAttendee: matchable.hasExternalAttendee,
		...extra,
	};
}
