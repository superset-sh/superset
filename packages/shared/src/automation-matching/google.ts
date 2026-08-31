import type {
	GmailTriggerEvent,
	GoogleCalendarTriggerEvent,
	TriggerScope,
} from "../automation-triggers";
import {
	type BaseMatchableEvent,
	bodyMatches,
	type MatchResult,
	no,
	scopeAllows,
	scopeAllowsAny,
} from "./core";

/**
 * A synced calendar change or a fire we scheduled off one, normalized to what
 * the triggers filter on. Emails are lower-cased at record time so the
 * comparison here is exact. A Google connection is one member's, so the
 * dispatcher — not the matcher — narrows candidates to the connection owner's
 * automations.
 */
export type GoogleCalendarMatchableEvent = BaseMatchableEvent & {
	provider: "google_calendar";
	eventType: GoogleCalendarTriggerEvent;
	calendarId: string;
	/** Organizer, creator and invitees together — everyone on the event. */
	attendeeEmails: string[];
	title: string | null;
	/** Someone on the event is outside the connected account's domain. */
	hasExternalAttendee: boolean;
	/** Set on `event.starting_soon`; how far ahead the fire was scheduled. */
	minutesBefore: number | null;
};

/** An arriving mail, normalized from its headers and label ids. */
export type GmailMatchableEvent = BaseMatchableEvent & {
	provider: "gmail";
	eventType: GmailTriggerEvent;
	fromAddress: string | null;
	toAddresses: string[];
	subject: string | null;
	labelIds: string[];
	hasAttachment: boolean;
};

export function googleCalendarTriggerMatches(
	config: {
		event: string;
		calendars: TriggerScope;
		attendee: TriggerScope;
		titleFilter: { pattern: string; isRegex: boolean } | null;
		hasExternalAttendee?: boolean;
		minutesBefore?: number;
	},
	event: GoogleCalendarMatchableEvent,
): MatchResult {
	if (config.event !== event.eventType) return no("event");
	if (!scopeAllows(config.calendars, event.calendarId)) return no("calendar");
	// The attendee filter is over a list of people rather than one: an event is
	// a match when any of its attendees satisfies it.
	if (!scopeAllowsAny(config.attendee, event.attendeeEmails)) {
		return no("attendee");
	}
	if (!bodyMatches(config.titleFilter, event.title)) return no("titleFilter");
	if (config.hasExternalAttendee && !event.hasExternalAttendee) {
		return no("hasExternalAttendee");
	}
	// The fire was scheduled for one lead time; a trigger asking for another
	// gets its own fire rather than this one.
	if (
		config.minutesBefore !== undefined &&
		config.minutesBefore !== event.minutesBefore
	) {
		return no("minutesBefore");
	}
	return { matches: true };
}

export function gmailTriggerMatches(
	config: {
		event: string;
		from: TriggerScope;
		to: TriggerScope;
		subjectFilter: { pattern: string; isRegex: boolean } | null;
		labels: TriggerScope;
		hasAttachment: boolean;
	},
	event: GmailMatchableEvent,
): MatchResult {
	if (config.event !== event.eventType) return no("event");
	if (
		!addressScopeAllows(
			config.from,
			event.fromAddress ? [event.fromAddress] : [],
		)
	) {
		return no("from");
	}
	if (!addressScopeAllows(config.to, event.toAddresses)) {
		return no("to");
	}
	if (!bodyMatches(config.subjectFilter, event.subject)) {
		return no("subjectFilter");
	}
	if (!scopeAllowsAny(config.labels, event.labelIds)) {
		return no("label");
	}
	if (config.hasAttachment && !event.hasAttachment) return no("hasAttachment");
	return { matches: true };
}

/**
 * A scope over addresses where each id is either a full address or a bare
 * domain, so "acme.com" admits everyone there. Both sides are compared
 * lower-cased; the recorded addresses already are.
 */
export function addressScopeAllows(
	scope: TriggerScope,
	addresses: string[],
): boolean {
	if (scope.mode === "any") return true;
	// "me" is pre-resolved by the dispatcher; unresolved it matches nobody.
	if (scope.mode === "me") return false;
	const wanted = scope.ids.map((id) => id.trim().toLowerCase());
	return addresses.some((address) =>
		wanted.some((id) =>
			id.includes("@") ? address === id : address.endsWith(`@${id}`),
		),
	);
}
