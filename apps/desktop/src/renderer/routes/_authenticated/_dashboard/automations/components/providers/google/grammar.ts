import type { MessageDescriptor } from "@lingui/core";
import { msg } from "@lingui/core/macro";
import type {
	GoogleCalendarTriggerEvent,
	TriggerConfigInput,
} from "@superset/shared/automation-triggers";
import type { TriggerMenuEntry } from "../types";

export type GoogleCalendarConfig = Extract<
	TriggerConfigInput,
	{ kind: "google_calendar" }
>;
export type GmailConfig = Extract<TriggerConfigInput, { kind: "gmail" }>;

/**
 * The sentences a Google trigger reads as, as data. Same shape as GitHub's:
 * every event names its own words and slots, and one renderer walks them.
 */

export type CalendarSlot =
	| "calendars"
	| "attendee"
	| "titleFilter"
	| "hasExternalAttendee"
	| "minutesBefore";

export type GmailSlot =
	| "from"
	| "to"
	| "subjectFilter"
	| "labels"
	| "hasAttachment";

export type SentencePart<Slot extends string> =
	| { text: string }
	| { slot: Slot };

export const CALENDAR_SENTENCES: Record<
	GoogleCalendarTriggerEvent,
	SentencePart<CalendarSlot>[]
> = {
	"event.created": [
		{ text: "Event created in" },
		{ slot: "calendars" },
		{ text: "with" },
		{ slot: "attendee" },
		{ text: "titled" },
		{ slot: "titleFilter" },
		{ text: "including" },
		{ slot: "hasExternalAttendee" },
	],
	"event.updated": [
		{ text: "Event updated in" },
		{ slot: "calendars" },
		{ text: "with" },
		{ slot: "attendee" },
		{ text: "titled" },
		{ slot: "titleFilter" },
		{ text: "including" },
		{ slot: "hasExternalAttendee" },
	],
	"event.cancelled": [
		{ text: "Event cancelled in" },
		{ slot: "calendars" },
		{ text: "with" },
		{ slot: "attendee" },
		{ text: "titled" },
		{ slot: "titleFilter" },
	],
	"event.starting_soon": [
		{ text: "Event starting in" },
		{ slot: "minutesBefore" },
		{ text: "on" },
		{ slot: "calendars" },
		{ text: "with" },
		{ slot: "attendee" },
		{ text: "titled" },
		{ slot: "titleFilter" },
	],
	"event.ended": [
		{ text: "Event ended in" },
		{ slot: "calendars" },
		{ text: "with" },
		{ slot: "attendee" },
		{ text: "titled" },
		{ slot: "titleFilter" },
	],
};

export const GMAIL_SENTENCE: SentencePart<GmailSlot>[] = [
	{ text: "Email received from" },
	{ slot: "from" },
	{ text: "to" },
	{ slot: "to" },
	{ text: "with subject" },
	{ slot: "subjectFilter" },
	{ text: "labeled" },
	{ slot: "labels" },
	{ slot: "hasAttachment" },
];

export const MINUTES_BEFORE_OPTIONS = [
	{
		value: "5",
		label: msg({
			message: "5 minutes",
		}),
	},
	{
		value: "10",
		label: msg({
			message: "10 minutes",
		}),
	},
	{
		value: "15",
		label: msg({
			message: "15 minutes",
		}),
	},
	{
		value: "30",
		label: msg({
			message: "30 minutes",
		}),
	},
	{
		value: "60",
		label: msg({
			message: "1 hour",
		}),
	},
	{
		value: "120",
		label: msg({
			message: "2 hours",
		}),
	},
] as const;

export const EXTERNAL_ATTENDEE_OPTIONS = [
	{
		value: "any",
		label: msg({
			message: "anyone",
		}),
	},
	{
		value: "external",
		label: msg({
			message: "someone external",
		}),
	},
] as const;

export const ATTACHMENT_OPTIONS = [
	{
		value: "any",
		label: msg({
			message: "with or without attachments",
		}),
	},
	{
		value: "attachment",
		label: msg({
			message: "with an attachment",
		}),
	},
] as const;

export const CALENDAR_MENU: TriggerMenuEntry<GoogleCalendarConfig>[] = [
	leaf(
		msg({
			message: "Event created",
		}),
		"event.created",
	),
	leaf(
		msg({
			message: "Event updated",
		}),
		"event.updated",
	),
	leaf(
		msg({
			message: "Event cancelled",
		}),
		"event.cancelled",
	),
	leaf(
		msg({
			message: "Event starting soon",
		}),
		"event.starting_soon",
	),
	leaf(
		msg({
			message: "Event ended",
		}),
		"event.ended",
	),
];

// One leaf, so the Add Trigger menu shows the provider row itself; the label
// only surfaces in search, where "gmail" has to find it.
export const GMAIL_MENU: TriggerMenuEntry<GmailConfig>[] = [
	{
		label: msg({
			message: "Email received in Gmail",
		}),
		create: createGmailConfig,
	},
];

function leaf(label: MessageDescriptor, event: GoogleCalendarTriggerEvent) {
	return { label, create: () => createCalendarConfig(event) };
}

/**
 * A new calendar trigger: the calendar still to be chosen (an empty list
 * matches nothing, and the form refuses to save until one is picked), every
 * optional narrowing wide open.
 */
export function createCalendarConfig(
	event: GoogleCalendarTriggerEvent,
): GoogleCalendarConfig {
	const base = {
		kind: "google_calendar" as const,
		calendars: { mode: "list" as const, ids: [] as string[] },
		attendee: { mode: "any" as const },
		titleFilter: null,
	};
	// Branching rather than spreading conditionally: the config is a union on
	// the event, and an optional field would not narrow it.
	switch (event) {
		case "event.created":
		case "event.updated":
			return { ...base, event, hasExternalAttendee: false };
		case "event.starting_soon":
			return { ...base, event, minutesBefore: 15 };
		case "event.cancelled":
		case "event.ended":
			return { ...base, event };
	}
}

/**
 * The sender is the primary scope and starts unchosen for the same reason a
 * GitHub repository does; the rest default to "any".
 */
export function createGmailConfig(): GmailConfig {
	return {
		kind: "gmail",
		event: "message.received",
		from: { mode: "list", ids: [] },
		to: { mode: "any" },
		subjectFilter: null,
		labels: { mode: "any" },
		hasAttachment: false,
	};
}
