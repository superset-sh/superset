/**
 * RRULE helpers:
 *   - serialize schedule-picker state into RFC 5545 and detect which preset
 *     an existing RRULE matches (string-only, no rrule.js dep)
 *   - format rules as short English (`describeSchedule`)
 *   - compute real-UTC occurrences with correct DST behavior
 *     (`parseRrule` / `nextOccurrenceAfter` / `nextOccurrences`)
 *
 * We intentionally run rrule.js on floating wall-clock dates without `TZID`.
 * `TZID` output varies with the host process timezone; floating dates keep the
 * recurrence calendar stable, then this module converts each occurrence to a
 * real UTC instant in the automation's configured timezone.
 */

import { TZDate } from "@date-fns/tz";
import { RRule } from "rrule";

const WEEKDAYS = ["MO", "TU", "WE", "TH", "FR"] as const;
const WEEKENDS = ["SA", "SU"] as const;
const DAY_ORDER = ["MO", "TU", "WE", "TH", "FR", "SA", "SU"] as const;
const DAY_SHORT: Record<string, string> = {
	MO: "Mon",
	TU: "Tue",
	WE: "Wed",
	TH: "Thu",
	FR: "Fri",
	SA: "Sat",
	SU: "Sun",
};
const DAY_LONG: Record<string, string> = {
	MO: "Monday",
	TU: "Tuesday",
	WE: "Wednesday",
	TH: "Thursday",
	FR: "Friday",
	SA: "Saturday",
	SU: "Sunday",
};

type RruleParts = Record<string, string>;

function parseRruleParts(rrule: string): RruleParts | null {
	const parts: RruleParts = {};
	for (const segment of rrule.split(";")) {
		const trimmed = segment.trim();
		if (!trimmed) continue;
		const eq = trimmed.indexOf("=");
		if (eq < 0) return null;
		const key = trimmed.slice(0, eq).trim().toUpperCase();
		const value = trimmed.slice(eq + 1).trim();
		if (!key || !value) return null;
		parts[key] = value;
	}
	return parts.FREQ ? parts : null;
}

function parseIntOrNull(value: string | undefined): number | null {
	if (value === undefined) return null;
	const n = Number.parseInt(value, 10);
	return Number.isFinite(n) ? n : null;
}

function ordinal(n: number): string {
	const absolute = Math.abs(n);
	const lastTwo = absolute % 100;
	if (lastTwo >= 11 && lastTwo <= 13) return `${n}th`;
	switch (absolute % 10) {
		case 1:
			return `${n}st`;
		case 2:
			return `${n}nd`;
		case 3:
			return `${n}rd`;
		default:
			return `${n}th`;
	}
}

function sortDays(days: string[]): string[] {
	return [...days].sort(
		(a, b) => DAY_ORDER.indexOf(a as never) - DAY_ORDER.indexOf(b as never),
	);
}

function sameSet(a: readonly string[], b: readonly string[]): boolean {
	if (a.length !== b.length) return false;
	const sortedA = sortDays([...a]).join(",");
	const sortedB = sortDays([...b]).join(",");
	return sortedA === sortedB;
}

function formatTimeOfDay(
	hour: number,
	minute: number,
	locale: string | undefined,
): string {
	// BYHOUR/BYMINUTE are wall-clock digits in the automation's own TZ, so we
	// only need locale-appropriate hour:minute rendering (12h vs 24h).
	const ref = new Date(Date.UTC(2000, 0, 3, hour, minute));
	return new Intl.DateTimeFormat(locale, {
		timeZone: "UTC",
		hour: "numeric",
		minute: "2-digit",
	}).format(ref);
}

function formatMonth(month: number, locale?: string): string {
	const ref = new Date(Date.UTC(2000, month - 1, 1));
	return new Intl.DateTimeFormat(locale, {
		timeZone: "UTC",
		month: "long",
	}).format(ref);
}

export type Weekday = "MO" | "TU" | "WE" | "TH" | "FR" | "SA" | "SU";

/**
 * Strict preset match — only the five shapes the SchedulePicker can author.
 * Anything else (intervals, MONTHLY/YEARLY, multi-day BYDAY outside
 * weekdays/weekends, etc.) collapses to `{ kind: "custom" }` so the picker
 * falls back to raw-RRULE editing.
 */
export type PresetMatch =
	| { kind: "hourly" }
	| { kind: "daily"; hour: number; minute: number }
	| { kind: "weekdays"; hour: number; minute: number }
	| { kind: "weekly"; day: Weekday; hour: number; minute: number }
	| { kind: "custom"; rrule: string };

export function matchPreset(rrule: string): PresetMatch {
	const parts = parseRruleParts(rrule);
	if (!parts) return { kind: "custom", rrule };

	if (parts.BYSETPOS || parts.BYYEARDAY || parts.BYWEEKNO) {
		return { kind: "custom", rrule };
	}
	if (parts.COUNT || parts.UNTIL) return { kind: "custom", rrule };

	const interval = parseIntOrNull(parts.INTERVAL) ?? 1;
	if (interval !== 1) return { kind: "custom", rrule };

	const freq = parts.FREQ;
	const byHour = parseIntOrNull(parts.BYHOUR);
	const byMinute = parseIntOrNull(parts.BYMINUTE) ?? 0;
	const byDay = parts.BYDAY
		? parts.BYDAY.split(",")
				.map((d) => d.trim().toUpperCase())
				.filter((d) => d in DAY_LONG)
		: [];

	if (freq === "HOURLY" && byHour === null && byDay.length === 0) {
		return { kind: "hourly" };
	}

	if (freq === "DAILY" && byHour !== null && byDay.length === 0) {
		return { kind: "daily", hour: byHour, minute: byMinute };
	}

	if (freq === "WEEKLY" && byHour !== null) {
		if (sameSet(byDay, WEEKDAYS)) {
			return { kind: "weekdays", hour: byHour, minute: byMinute };
		}
		if (byDay.length === 1) {
			return {
				kind: "weekly",
				day: byDay[0] as Weekday,
				hour: byHour,
				minute: byMinute,
			};
		}
	}

	return { kind: "custom", rrule };
}

export function buildRrule(match: PresetMatch): string {
	switch (match.kind) {
		case "hourly":
			return "FREQ=HOURLY";
		case "daily":
			return `FREQ=DAILY;BYHOUR=${match.hour};BYMINUTE=${match.minute}`;
		case "weekdays":
			return `FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR;BYHOUR=${match.hour};BYMINUTE=${match.minute}`;
		case "weekly":
			return `FREQ=WEEKLY;BYDAY=${match.day};BYHOUR=${match.hour};BYMINUTE=${match.minute}`;
		case "custom":
			return match.rrule;
	}
}

export interface DescribeScheduleOptions {
	/** BCP-47 locale for time formatting. Defaults to runtime default. */
	locale?: string;
}

/**
 * Human-readable cadence like "Weekdays at 9:00 AM".
 * Falls back to "Custom" when the rule falls outside our handled patterns.
 */
export function describeSchedule(
	rrule: string,
	options: DescribeScheduleOptions = {},
): string {
	const parts = parseRruleParts(rrule);
	if (!parts) return "Custom";

	const { locale } = options;
	const freq = parts.FREQ;
	const interval = parseIntOrNull(parts.INTERVAL) ?? 1;
	const byHour = parseIntOrNull(parts.BYHOUR);
	const byMinute = parseIntOrNull(parts.BYMINUTE) ?? 0;
	const byDay = parts.BYDAY
		? parts.BYDAY.split(",")
				.map((d) => d.trim().toUpperCase())
				.filter((d) => d in DAY_LONG)
		: [];
	const byMonth = parseIntOrNull(parts.BYMONTH);
	const byMonthDay = parseIntOrNull(parts.BYMONTHDAY);

	// Anything that references sub-patterns we don't generate → Custom.
	if (parts.BYSETPOS || parts.BYYEARDAY || parts.BYWEEKNO) return "Custom";
	if (parts.COUNT || parts.UNTIL) {
		// Still describable, but prefer Custom so the bounded nature isn't hidden.
		return "Custom";
	}

	const atTime =
		byHour !== null ? ` at ${formatTimeOfDay(byHour, byMinute, locale)}` : "";

	switch (freq) {
		case "MINUTELY":
			if (interval === 1) return "Every minute";
			return `Every ${interval} minutes`;

		case "HOURLY":
			if (interval === 1) return "Hourly";
			return `Every ${interval} hours`;

		case "DAILY":
			if (interval === 1) return `Daily${atTime}`;
			return `Every ${interval} days${atTime}`;

		case "WEEKLY": {
			if (interval !== 1) {
				// "Every 2 weeks on Monday" — still cleaner than raw rrule.
				if (byDay.length === 1) {
					return `Every ${interval} weeks on ${DAY_LONG[byDay[0] as keyof typeof DAY_LONG]}${atTime}`;
				}
				return "Custom";
			}
			if (byDay.length === 0) return `Weekly${atTime}`;
			if (sameSet(byDay, WEEKDAYS)) return `Weekdays${atTime}`;
			if (sameSet(byDay, WEEKENDS)) return `Weekends${atTime}`;
			if (byDay.length === 1) {
				return `${DAY_LONG[byDay[0] as keyof typeof DAY_LONG]}s${atTime}`;
			}
			const list = sortDays(byDay)
				.map((d) => DAY_SHORT[d as keyof typeof DAY_SHORT])
				.join(", ");
			return `${list}${atTime}`;
		}

		case "MONTHLY": {
			if (interval !== 1) return "Custom";
			if (byMonthDay === -1) return `Last day of each month${atTime}`;
			if (byMonthDay !== null && byMonthDay >= 1 && byMonthDay <= 31) {
				return `Monthly on the ${ordinal(byMonthDay)}${atTime}`;
			}
			if (byDay.length === 1) {
				return `Monthly on ${DAY_LONG[byDay[0] as keyof typeof DAY_LONG]}${atTime}`;
			}
			return `Monthly${atTime}`;
		}

		case "YEARLY": {
			if (interval !== 1) return "Custom";
			if (byMonth !== null && byMonthDay !== null) {
				return `Annually on ${formatMonth(byMonth, locale)} ${byMonthDay}${atTime}`;
			}
			return `Annually${atTime}`;
		}

		default:
			return "Custom";
	}
}

// ---- rrule.js-backed occurrence math ---------------------------------------

export interface ParsedRecurrence {
	rrule: string;
	dtstart: Date;
	timezone: string;
	nextRunAt: Date;
}

/** Wall-clock-as-UTC → real UTC in the given zone. */
export function rruleDateToUtc(rruleDate: Date, timezone: string): Date {
	const zoned = new TZDate(
		rruleDate.getUTCFullYear(),
		rruleDate.getUTCMonth(),
		rruleDate.getUTCDate(),
		rruleDate.getUTCHours(),
		rruleDate.getUTCMinutes(),
		rruleDate.getUTCSeconds(),
		timezone,
	);
	return new Date(zoned.getTime());
}

/** Real UTC → wall-clock-as-UTC in the given zone (rrule.js input space). */
export function utcToRruleDate(realUtc: Date, timezone: string): Date {
	const tz = new TZDate(realUtc.getTime(), timezone);
	return new Date(
		Date.UTC(
			tz.getFullYear(),
			tz.getMonth(),
			tz.getDate(),
			tz.getHours(),
			tz.getMinutes(),
			tz.getSeconds(),
		),
	);
}

/**
 * Serialize a Date into the local wall-clock string format RRule requires
 * (`YYYYMMDDTHHMMSS`), given an IANA timezone.
 */
function formatRRuleLocalDtstart(dtstart: Date, timezone: string): string {
	const formatter = new Intl.DateTimeFormat("en-CA", {
		timeZone: timezone,
		year: "numeric",
		month: "2-digit",
		day: "2-digit",
		hour: "2-digit",
		minute: "2-digit",
		second: "2-digit",
		hour12: false,
	});
	const parts = Object.fromEntries(
		formatter.formatToParts(dtstart).map((p) => [p.type, p.value]),
	);
	return `${parts.year}${parts.month}${parts.day}T${parts.hour}${parts.minute}${parts.second}`;
}

function buildRuleString(
	rrule: string,
	dtstart: Date,
	timezone: string,
): string {
	return `DTSTART:${formatRRuleLocalDtstart(dtstart, timezone)}\nRRULE:${rrule}`;
}

/**
 * The next real-UTC occurrence strictly after `after`, or null when the
 * recurrence is exhausted (UNTIL/COUNT).
 */
export function nextOccurrenceAfter(args: {
	rrule: string;
	dtstart: Date;
	timezone: string;
	after: Date;
}): Date | null {
	const rule = RRule.fromString(
		buildRuleString(args.rrule, args.dtstart, args.timezone),
	);
	const next = rule.after(utcToRruleDate(args.after, args.timezone), false);
	return next ? rruleDateToUtc(next, args.timezone) : null;
}

/** Parses + validates an RRule body, returning the next occurrence. */
export function parseRrule(args: {
	rrule: string;
	dtstart: Date;
	timezone: string;
	after?: Date;
}): ParsedRecurrence {
	const next = nextOccurrenceAfter({
		rrule: args.rrule,
		dtstart: args.dtstart,
		timezone: args.timezone,
		after: args.after ?? new Date(),
	});
	if (!next) throw new Error("Recurrence has no future occurrences");
	return {
		rrule: args.rrule,
		dtstart: args.dtstart,
		timezone: args.timezone,
		nextRunAt: next,
	};
}

/** Next N upcoming occurrences, for the create-modal preview. */
export function nextOccurrences(args: {
	rrule: string;
	dtstart: Date;
	timezone: string;
	count: number;
	after?: Date;
}): Date[] {
	const results: Date[] = [];
	let cursor = args.after ?? new Date();
	for (let i = 0; i < args.count; i++) {
		const next = nextOccurrenceAfter({
			rrule: args.rrule,
			dtstart: args.dtstart,
			timezone: args.timezone,
			after: cursor,
		});
		if (!next) break;
		results.push(next);
		cursor = next;
	}
	return results;
}

export interface FormatDateTimeInTimezoneOptions {
	/** BCP-47 locale for date/time formatting. Defaults to runtime default. */
	locale?: string;
}

const DATE_TIME_IN_TIMEZONE_FORMAT_OPTIONS: Intl.DateTimeFormatOptions = {
	month: "short",
	day: "numeric",
	year: "numeric",
	hour: "numeric",
	minute: "2-digit",
	timeZoneName: "short",
};

/** Format a real UTC instant in the automation's configured timezone. */
export function formatDateTimeInTimezone(
	date: Date,
	timezone: string,
	options: FormatDateTimeInTimezoneOptions = {},
): string {
	try {
		return new Intl.DateTimeFormat(options.locale, {
			...DATE_TIME_IN_TIMEZONE_FORMAT_OPTIONS,
			timeZone: timezone,
		}).format(date);
	} catch {
		return new Intl.DateTimeFormat(options.locale, {
			...DATE_TIME_IN_TIMEZONE_FORMAT_OPTIONS,
			timeZone: "UTC",
		}).format(date);
	}
}
