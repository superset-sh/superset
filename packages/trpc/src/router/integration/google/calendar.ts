import { calendar, type calendar_v3 } from "@googleapis/calendar";
import { googleAuthFor, googleErrorStatus } from "./auth";
import { CALENDAR_CHANNEL_TTL_MS, GOOGLE_API_TIMEOUT_MS } from "./constants";

/** The SDK's resources, narrowed to the id Google always sends. */
export type GoogleCalendarEvent = calendar_v3.Schema$Event & { id: string };
export type GoogleCalendarListEntry = calendar_v3.Schema$CalendarListEntry & {
	id: string;
};

function hasId<T extends { id?: string | null }>(
	item: T,
): item is T & { id: string } {
	return typeof item.id === "string" && item.id.length > 0;
}

async function calendarFor(
	connectionId: string,
): Promise<calendar_v3.Calendar> {
	return calendar({
		version: "v3",
		auth: await googleAuthFor(connectionId),
		timeout: GOOGLE_API_TIMEOUT_MS,
	});
}

export async function listCalendars(
	connectionId: string,
): Promise<GoogleCalendarListEntry[]> {
	const client = await calendarFor(connectionId);
	const items: GoogleCalendarListEntry[] = [];
	let pageToken: string | undefined;
	do {
		const { data } = await client.calendarList.list({
			maxResults: 250,
			showDeleted: false,
			pageToken,
		});
		items.push(...(data.items ?? []).filter(hasId));
		pageToken = data.nextPageToken ?? undefined;
	} while (pageToken);
	return items;
}

/**
 * The changes since `syncToken`, or the whole calendar when there is none.
 *
 * `showDeleted` is what makes cancellations visible; without it a deleted
 * event simply stops appearing. Recurring events come back as their master
 * plus any individually edited instances rather than expanded, so a busy
 * calendar's full sync is a handful of pages rather than every occurrence
 * until the end of time.
 */
export async function listEventChanges(
	connectionId: string,
	calendarId: string,
	syncToken: string | undefined,
): Promise<
	| { expired: true }
	| { expired: false; items: GoogleCalendarEvent[]; nextSyncToken: string }
> {
	const client = await calendarFor(connectionId);
	const items: GoogleCalendarEvent[] = [];
	let pageToken: string | undefined;
	let nextSyncToken: string | undefined;
	do {
		let page: calendar_v3.Schema$Events;
		try {
			({ data: page } = await client.events.list({
				calendarId,
				showDeleted: true,
				maxResults: syncToken ? 250 : 2500,
				syncToken,
				pageToken,
			}));
		} catch (error) {
			// 410 Gone: the token is too old to diff from. Google's protocol is to
			// drop it and start over with a full sync.
			if (googleErrorStatus(error) === 410) return { expired: true };
			throw error;
		}
		items.push(...(page.items ?? []).filter(hasId));
		pageToken = page.nextPageToken ?? undefined;
		nextSyncToken = page.nextSyncToken ?? undefined;
	} while (pageToken);
	if (!nextSyncToken) {
		throw new Error(`Calendar sync of ${calendarId} returned no sync token`);
	}
	return { expired: false, items, nextSyncToken };
}

/**
 * Concrete occurrences starting in a window, recurring ones expanded, so a
 * fire can be scheduled off each start and end time.
 */
export async function listUpcomingInstances(
	connectionId: string,
	calendarId: string,
	window: { from: Date; to: Date },
): Promise<GoogleCalendarEvent[]> {
	const client = await calendarFor(connectionId);
	const items: GoogleCalendarEvent[] = [];
	let pageToken: string | undefined;
	do {
		const { data } = await client.events.list({
			calendarId,
			singleEvents: true,
			orderBy: "startTime",
			timeMin: window.from.toISOString(),
			timeMax: window.to.toISOString(),
			maxResults: 250,
			pageToken,
		});
		items.push(...(data.items ?? []).filter(hasId));
		pageToken = data.nextPageToken ?? undefined;
	} while (pageToken);
	return items;
}

/** The instances of one recurring event inside a window. */
export async function listEventInstances(
	connectionId: string,
	calendarId: string,
	eventId: string,
	window: { from: Date; to: Date },
): Promise<GoogleCalendarEvent[]> {
	const client = await calendarFor(connectionId);
	const items: GoogleCalendarEvent[] = [];
	let pageToken: string | undefined;
	do {
		const { data } = await client.events.instances({
			calendarId,
			eventId,
			timeMin: window.from.toISOString(),
			timeMax: window.to.toISOString(),
			maxResults: 250,
			pageToken,
		});
		items.push(...(data.items ?? []).filter(hasId));
		pageToken = data.nextPageToken ?? undefined;
	} while (pageToken);
	return items;
}

/** Null when the event no longer exists at all (404), as opposed to cancelled. */
export async function getEvent(
	connectionId: string,
	calendarId: string,
	eventId: string,
): Promise<GoogleCalendarEvent | null> {
	const client = await calendarFor(connectionId);
	try {
		const { data } = await client.events.get({ calendarId, eventId });
		return hasId(data) ? data : null;
	} catch (error) {
		if (googleErrorStatus(error) === 404) return null;
		throw error;
	}
}

/**
 * Opens a push channel on a calendar. Google will POST to `address` with the
 * channel id and this token on every change; the token is what the push route
 * checks, since Google signs nothing.
 */
export async function watchCalendar(
	connectionId: string,
	calendarId: string,
	channel: { id: string; token: string; address: string },
): Promise<{ resourceId: string; expiration: number }> {
	const client = await calendarFor(connectionId);
	const { data } = await client.events.watch({
		calendarId,
		requestBody: {
			id: channel.id,
			type: "web_hook",
			address: channel.address,
			token: channel.token,
			expiration: String(Date.now() + CALENDAR_CHANNEL_TTL_MS),
		},
	});
	if (!data.resourceId) {
		throw new Error(`Calendar watch on ${calendarId} returned no resource id`);
	}
	return {
		resourceId: data.resourceId,
		expiration: Number(data.expiration ?? Date.now() + CALENDAR_CHANNEL_TTL_MS),
	};
}

/** Best effort: a channel that is already gone is not an error worth raising. */
export async function stopChannel(
	connectionId: string,
	channel: { id: string; resourceId: string },
): Promise<void> {
	const client = await calendarFor(connectionId);
	try {
		await client.channels.stop({ requestBody: channel });
	} catch (error) {
		if (googleErrorStatus(error) === 404) return;
		throw error;
	}
}

/** RFC 3339 for timed events; all-day events carry a date and no time. */
export function eventStart(event: GoogleCalendarEvent): Date | null {
	return event.start?.dateTime ? new Date(event.start.dateTime) : null;
}

export function eventEnd(event: GoogleCalendarEvent): Date | null {
	return event.end?.dateTime ? new Date(event.end.dateTime) : null;
}

/** Everyone on the event — organizer, creator and invitees — lower-cased. */
export function eventAttendeeEmails(event: GoogleCalendarEvent): string[] {
	const emails = new Set<string>();
	for (const person of [
		event.organizer,
		event.creator,
		...(event.attendees ?? []),
	]) {
		if (person?.email) emails.add(person.email.toLowerCase());
	}
	return [...emails];
}
