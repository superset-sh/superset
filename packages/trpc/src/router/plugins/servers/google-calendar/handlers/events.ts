import {
	calendar,
	calendarId,
	type EventTime,
	eventTime,
	instant,
	isDateTime,
	optionalString,
	requireString,
	stringList,
	text,
} from "../api";
import type { Handler } from "../types";

interface Attendee {
	email?: string;
	displayName?: string;
	responseStatus?: string;
	optional?: boolean;
	organizer?: boolean;
	self?: boolean;
}

interface CalendarEvent {
	id?: string;
	status?: string;
	summary?: string;
	description?: string;
	location?: string;
	htmlLink?: string;
	hangoutLink?: string;
	start?: { date?: string; dateTime?: string; timeZone?: string };
	end?: { date?: string; dateTime?: string; timeZone?: string };
	attendees?: Attendee[];
	organizer?: { email?: string };
	recurrence?: string[];
	recurringEventId?: string;
}

const SEND_UPDATES = ["all", "externalOnly", "none"];
const RESPONSES = ["accepted", "declined", "tentative"];

function when(time: CalendarEvent["start"]): string {
	if (!time) return "?";
	if (time.date) return `${time.date} (all day)`;
	return time.timeZone
		? `${time.dateTime} ${time.timeZone}`
		: `${time.dateTime}`;
}

function summarize(event: CalendarEvent): string {
	const cancelled = event.status === "cancelled" ? " [cancelled]" : "";
	return `[${event.id}] ${event.summary ?? "(no title)"}${cancelled} — ${when(event.start)} → ${when(event.end)}`;
}

function describe(event: CalendarEvent): string {
	const lines = [summarize(event)];
	if (event.location) lines.push(`Location: ${event.location}`);
	if (event.organizer?.email) lines.push(`Organizer: ${event.organizer.email}`);
	if (event.hangoutLink) lines.push(`Meet: ${event.hangoutLink}`);
	if (event.recurrence?.length)
		lines.push(`Recurrence: ${event.recurrence.join("; ")}`);
	if (event.recurringEventId)
		lines.push(`Occurrence of series ${event.recurringEventId}`);
	if (event.attendees?.length) {
		lines.push("Attendees:");
		for (const attendee of event.attendees) {
			const tags = [
				attendee.responseStatus,
				attendee.organizer ? "organizer" : undefined,
				attendee.optional ? "optional" : undefined,
				attendee.self ? "you" : undefined,
			].filter(Boolean);
			lines.push(`  ${attendee.email} (${tags.join(", ")})`);
		}
	}
	if (event.description) lines.push("", event.description);
	if (event.htmlLink) lines.push("", event.htmlLink);
	return lines.join("\n");
}

function sendUpdates(args: Record<string, unknown>): string {
	const value = optionalString(args, "sendUpdates") ?? "all";
	if (!SEND_UPDATES.includes(value)) {
		throw new Error(`sendUpdates must be one of ${SEND_UPDATES.join(", ")}`);
	}
	return value;
}

async function zoneFor(
	args: Record<string, unknown>,
	accessToken: string,
	cid: string,
): Promise<string | undefined> {
	const given = optionalString(args, "timeZone");
	if (given) return given;
	if (![args.start, args.end].some(isDateTime)) return undefined;
	const owner = await calendar<{ timeZone?: string }>(accessToken, [
		"calendars",
		cid,
	]);
	return owner.timeZone;
}

function nextDay(date: string): string {
	const day = new Date(`${date}T00:00:00Z`);
	day.setUTCDate(day.getUTCDate() + 1);
	return day.toISOString().slice(0, 10);
}

function times(
	args: Record<string, unknown>,
	zone: string | undefined,
): { start?: EventTime; end?: EventTime } {
	const startValue = optionalString(args, "start");
	const endValue = optionalString(args, "end");
	const start = startValue ? eventTime(startValue, "start", zone) : undefined;
	let end = endValue ? eventTime(endValue, "end", zone) : undefined;
	if (start && end && "date" in start && "date" in end) {
		if (end.date < start.date) throw new Error("end is before start");
		if (end.date === start.date) end = { date: nextDay(start.date) };
	}
	return { start, end };
}

function attendees(
	args: Record<string, unknown>,
	current: Attendee[] = [],
): Attendee[] | undefined {
	if (args.attendees === null) {
		throw new Error("attendees cannot be null; pass [] to remove every guest");
	}
	if (args.attendees === undefined) {
		if (args.optionalAttendees !== undefined) {
			throw new Error(
				"optionalAttendees marks people in attendees, so pass attendees too",
			);
		}
		return undefined;
	}
	const optional =
		args.optionalAttendees === undefined
			? undefined
			: new Set(stringList(args.optionalAttendees, "optionalAttendees"));
	return stringList(args.attendees, "attendees").map((email) => {
		const existing = current.find(
			(attendee) => attendee.email?.toLowerCase() === email.toLowerCase(),
		);
		return {
			...existing,
			email,
			optional: optional ? optional.has(email) : (existing?.optional ?? false),
		};
	});
}

function details(args: Record<string, unknown>) {
	const fields: Record<string, unknown> = {};
	for (const field of ["summary", "description", "location"]) {
		if (typeof args[field] === "string") fields[field] = args[field];
	}
	if (args.recurrence !== undefined) {
		fields.recurrence = stringList(args.recurrence, "recurrence");
	}
	return fields;
}

export const eventHandlers: Record<string, Handler> = {
	list_events: async (args, accessToken) => {
		const timeMin = optionalString(args, "timeMin");
		const timeMax = optionalString(args, "timeMax");
		const maxResults = Number(args.maxResults ?? 50);
		if (!Number.isInteger(maxResults) || maxResults < 1 || maxResults > 250) {
			throw new Error("maxResults must be a whole number from 1 to 250");
		}
		const data = await calendar<{
			items?: CalendarEvent[];
			nextPageToken?: string;
			timeZone?: string;
		}>(accessToken, ["calendars", calendarId(args), "events"], {
			query: {
				timeMin: timeMin
					? instant(timeMin, "timeMin")
					: new Date().toISOString(),
				timeMax: timeMax ? instant(timeMax, "timeMax") : undefined,
				q: optionalString(args, "query"),
				maxResults,
				pageToken: optionalString(args, "pageToken"),
				singleEvents: true,
				orderBy: "startTime",
				timeZone: optionalString(args, "timeZone"),
			},
		});
		const events = data.items ?? [];
		if (!events.length) return text("No events in this range");
		const lines = [
			`${events.length} event(s), calendar time zone ${data.timeZone}`,
		];
		for (const event of events) lines.push(summarize(event));
		if (data.nextPageToken) {
			lines.push("", `More events: pass pageToken ${data.nextPageToken}`);
		}
		return text(lines.join("\n"));
	},

	get_event: async (args, accessToken) => {
		const event = await calendar<CalendarEvent>(accessToken, [
			"calendars",
			calendarId(args),
			"events",
			requireString(args, "eventId"),
		]);
		return text(describe(event));
	},

	create_event: async (args, accessToken) => {
		const cid = calendarId(args);
		requireString(args, "summary");
		requireString(args, "start");
		requireString(args, "end");
		const { start, end } = times(args, await zoneFor(args, accessToken, cid));
		const list = attendees(args);
		const meet = args.addGoogleMeet === true;
		const event = await calendar<CalendarEvent>(
			accessToken,
			["calendars", cid, "events"],
			{
				method: "POST",
				query: {
					sendUpdates: sendUpdates(args),
					conferenceDataVersion: meet ? 1 : undefined,
				},
				body: {
					...details(args),
					start,
					end,
					...(list ? { attendees: list } : {}),
					...(meet
						? {
								conferenceData: {
									createRequest: {
										requestId: crypto.randomUUID(),
										conferenceSolutionKey: { type: "hangoutsMeet" },
									},
								},
							}
						: {}),
				},
			},
		);
		return text(`✓ Created event\n${describe(event)}`);
	},

	update_event: async (args, accessToken) => {
		const cid = calendarId(args);
		const eventId = requireString(args, "eventId");
		const { start, end } = times(args, await zoneFor(args, accessToken, cid));
		const segments = ["calendars", cid, "events", eventId];
		const current =
			args.attendees === undefined
				? undefined
				: await calendar<CalendarEvent>(accessToken, segments);
		const list = attendees(args, current?.attendees);
		const event = await calendar<CalendarEvent>(accessToken, segments, {
			method: "PATCH",
			query: { sendUpdates: sendUpdates(args) },
			body: {
				...details(args),
				...(start ? { start } : {}),
				...(end ? { end } : {}),
				...(list ? { attendees: list } : {}),
			},
		});
		return text(`✓ Updated event\n${describe(event)}`);
	},

	delete_event: async (args, accessToken) => {
		const eventId = requireString(args, "eventId");
		await calendar(
			accessToken,
			["calendars", calendarId(args), "events", eventId],
			{
				method: "DELETE",
				query: { sendUpdates: sendUpdates(args) },
			},
		);
		return text(`✓ Deleted event ${eventId}`);
	},

	respond_to_event: async (args, accessToken) => {
		const cid = calendarId(args);
		const eventId = requireString(args, "eventId");
		const response = requireString(args, "response");
		if (!RESPONSES.includes(response)) {
			throw new Error(`response must be one of ${RESPONSES.join(", ")}`);
		}
		const segments = ["calendars", cid, "events", eventId];
		const current = await calendar<CalendarEvent>(accessToken, segments);
		const self = current.attendees?.find((attendee) => attendee.self);
		if (!self?.email) {
			throw new Error(
				"You are not an attendee of this event, so there is no invitation to respond to",
			);
		}
		const event = await calendar<CalendarEvent>(accessToken, segments, {
			method: "PATCH",
			query: { sendUpdates: "all" },
			body: {
				attendeesOmitted: true,
				attendees: [{ email: self.email, responseStatus: response }],
			},
		});
		return text(`✓ Responded ${response}\n${describe(event)}`);
	},
};
