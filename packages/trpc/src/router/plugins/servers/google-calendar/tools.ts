import type { ToolDefinition } from "./types";

function tool(
	name: string,
	description: string,
	properties: Record<string, object>,
	required: string[],
	readOnly: boolean,
	destructive = false,
): ToolDefinition {
	return {
		name,
		description,
		inputSchema: { type: "object", properties, required },
		annotations: { readOnlyHint: readOnly, destructiveHint: destructive },
	};
}

const CALENDAR_ID = {
	type: "string",
	description:
		'Calendar ID from list_calendars. Defaults to "primary", the user\'s own calendar.',
};
const EVENT_ID = { type: "string", description: "Event ID." };
const TIME_ZONE = {
	type: "string",
	description:
		"IANA time zone, e.g. America/New_York. Start and end without a UTC offset are read in it, and a recurring event repeats in it. Defaults to the calendar's time zone.",
};
const RANGE_BOUND = {
	type: "string",
	description: "Date-time with a UTC offset, e.g. 2026-10-07T09:00:00-07:00.",
};
const SEND_UPDATES = {
	type: "string",
	enum: ["all", "externalOnly", "none"],
	description:
		'Who Google emails about the change. Defaults to "all" attendees.',
};

const EVENT_FIELDS = {
	summary: { type: "string", description: "Event title." },
	description: { type: "string", description: "Event notes." },
	location: { type: "string", description: "Place or address." },
	start: {
		type: "string",
		description:
			"Start: a date-time (2026-10-07T15:00:00, with or without an offset) or a date (2026-10-07) for an all-day event.",
	},
	end: {
		type: "string",
		description:
			"End, same form as start. For an all-day event the end date is exclusive; the same date as start means one day.",
	},
	timeZone: TIME_ZONE,
	attendees: {
		type: "array",
		items: { type: "string" },
		description:
			"Attendee email addresses. On update this replaces the whole list.",
	},
	optionalAttendees: {
		type: "array",
		items: { type: "string" },
		description: "Which of the attendees are optional.",
	},
	recurrence: {
		type: "array",
		items: { type: "string" },
		description: 'RFC 5545 rules, e.g. ["RRULE:FREQ=WEEKLY;BYDAY=MO"].',
	},
	sendUpdates: SEND_UPDATES,
	calendarId: CALENDAR_ID,
};

export function getTools(): ToolDefinition[] {
	return [
		tool(
			"list_calendars",
			"Lists the calendars the user can see, with each one's ID, access role, and time zone",
			{},
			[],
			true,
		),
		tool(
			"list_events",
			"Lists events in a time range in start order, with recurring events expanded into occurrences. Defaults to upcoming events from now",
			{
				calendarId: CALENDAR_ID,
				timeMin: RANGE_BOUND,
				timeMax: RANGE_BOUND,
				query: {
					type: "string",
					description:
						"Free text matched against title, notes, location, and attendees.",
				},
				maxResults: {
					type: "number",
					description: "Default 50, maximum 250.",
				},
				pageToken: { type: "string", description: "From a previous call." },
				timeZone: {
					type: "string",
					description: "IANA time zone to report times in.",
				},
			},
			[],
			true,
		),
		tool(
			"get_event",
			"Gets one event with its attendees and their responses, Meet link, recurrence, and notes",
			{ calendarId: CALENDAR_ID, eventId: EVENT_ID },
			["eventId"],
			true,
		),
		tool(
			"find_free_time",
			"Finds windows where every given calendar is free, from Google's free/busy data. Works for other people's calendars when they share free/busy. A window is free only for the calendars Google could read; the result names any it could not. Windows are reported in UTC and ignore working hours. At most 50 calendars",
			{
				calendarIds: {
					type: "array",
					items: { type: "string" },
					description:
						'Calendar IDs or attendee email addresses. Defaults to ["primary"].',
				},
				timeMin: RANGE_BOUND,
				timeMax: RANGE_BOUND,
				durationMinutes: {
					type: "number",
					description: "Shortest window to report. Default 30.",
				},
			},
			["timeMin", "timeMax"],
			true,
		),
		tool(
			"create_event",
			"Creates an event. Attendees get an email invitation unless sendUpdates says otherwise",
			{
				...EVENT_FIELDS,
				addGoogleMeet: {
					type: "boolean",
					description: "Attach a new Google Meet link.",
				},
			},
			["summary", "start", "end"],
			false,
		),
		tool(
			"update_event",
			"Changes only the fields given. For a recurring event, an occurrence ID changes that occurrence and the series ID changes every occurrence",
			{ ...EVENT_FIELDS, eventId: EVENT_ID },
			["eventId"],
			false,
		),
		tool(
			"delete_event",
			"Deletes an event and, by default, emails attendees a cancellation",
			{ calendarId: CALENDAR_ID, eventId: EVENT_ID, sendUpdates: SEND_UPDATES },
			["eventId"],
			false,
			true,
		),
		tool(
			"respond_to_event",
			"Accepts, declines, or tentatively accepts an invitation the user received. The organizer is notified",
			{
				calendarId: CALENDAR_ID,
				eventId: EVENT_ID,
				response: {
					type: "string",
					enum: ["accepted", "declined", "tentative"],
				},
			},
			["eventId", "response"],
			false,
		),
	];
}
