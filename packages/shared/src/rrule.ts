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
import { msg } from "@lingui/core/macro";
import { RRule } from "rrule";
import { i18n } from "./i18n";

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

/** 2024-01-01 was a Monday: the reference week for locale weekday names. */
const WEEKDAY_REFERENCE_DATE: Record<string, number> = {
	MO: 1,
	TU: 2,
	WE: 3,
	TH: 4,
	FR: 5,
	SA: 6,
	SU: 7,
};

function formatWeekday(
	day: string,
	width: "long" | "short",
	locale: string | undefined,
): string {
	const reference = WEEKDAY_REFERENCE_DATE[day];
	if (reference === undefined) {
		return width === "long" ? (DAY_LONG[day] ?? day) : (DAY_SHORT[day] ?? day);
	}
	return new Intl.DateTimeFormat(locale, {
		timeZone: "UTC",
		weekday: width,
	}).format(new Date(Date.UTC(2024, 0, reference)));
}

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
 * Strict preset match — only the four shapes the SchedulePicker can author.
 * Anything else (intervals, MONTHLY/YEARLY, multi-day BYDAY, etc.) collapses
 * to `{ kind: "custom" }` so the picker falls back to raw-RRULE editing.
 */
export type PresetMatch =
	| { kind: "hourly" }
	| { kind: "daily"; hour: number; minute: number }
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
	const custom = () => i18n._(msg({ message: "Custom" }));
	const parts = parseRruleParts(rrule);
	if (!parts) return custom();

	// Falls back to the active app locale, not the system default: the sentence
	// around these values is already translated, so "every Sunday" must not
	// render its weekday in the OS language.
	const locale = options.locale ?? i18n.locale;
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
	if (parts.BYSETPOS || parts.BYYEARDAY || parts.BYWEEKNO) return custom();
	if (parts.COUNT || parts.UNTIL) {
		// Still describable, but prefer Custom so the bounded nature isn't hidden.
		return custom();
	}

	const hasTime = byHour !== null;
	const time = hasTime ? formatTimeOfDay(byHour, byMinute, locale) : "";

	switch (freq) {
		case "MINUTELY":
			if (interval === 1) {
				return i18n._(
					msg({
						message: "Every minute",
					}),
				);
			}
			return i18n._({
				...msg({
					message:
						"{count, plural, one {Every # minute} other {Every # minutes}}",
				}),
				values: { count: interval },
			});

		case "HOURLY":
			if (interval === 1) {
				return i18n._(msg({ message: "Hourly" }));
			}
			return i18n._({
				...msg({
					message: "{count, plural, one {Every # hour} other {Every # hours}}",
				}),
				values: { count: interval },
			});

		case "DAILY":
			if (interval === 1) {
				return hasTime
					? i18n._({
							...msg({
								message: "Daily at {time}",
							}),
							values: { time },
						})
					: i18n._(msg({ message: "Daily" }));
			}
			return hasTime
				? i18n._({
						...msg({
							message:
								"{count, plural, one {Every # day at {time}} other {Every # days at {time}}}",
						}),
						values: { count: interval, time },
					})
				: i18n._({
						...msg({
							message:
								"{count, plural, one {Every # day} other {Every # days}}",
						}),
						values: { count: interval },
					});

		case "WEEKLY": {
			if (interval !== 1) {
				// "Every 2 weeks on Monday" — still cleaner than raw rrule.
				if (byDay.length === 1) {
					const day = formatWeekday(byDay[0] as string, "long", locale);
					return hasTime
						? i18n._({
								...msg({
									message:
										"{count, plural, one {Every # week on {day} at {time}} other {Every # weeks on {day} at {time}}}",
								}),
								values: { count: interval, day, time },
							})
						: i18n._({
								...msg({
									message:
										"{count, plural, one {Every # week on {day}} other {Every # weeks on {day}}}",
								}),
								values: { count: interval, day },
							});
				}
				return custom();
			}
			if (byDay.length === 0) {
				return hasTime
					? i18n._({
							...msg({
								message: "Weekly at {time}",
							}),
							values: { time },
						})
					: i18n._(msg({ message: "Weekly" }));
			}
			if (sameSet(byDay, WEEKDAYS)) {
				return hasTime
					? i18n._({
							...msg({
								message: "Weekdays at {time}",
							}),
							values: { time },
						})
					: i18n._(msg({ message: "Weekdays" }));
			}
			if (sameSet(byDay, WEEKENDS)) {
				return hasTime
					? i18n._({
							...msg({
								message: "Weekends at {time}",
							}),
							values: { time },
						})
					: i18n._(msg({ message: "Weekends" }));
			}
			if (byDay.length === 1) {
				const day = formatWeekday(byDay[0] as string, "long", locale);
				// "{day}s" pluralized a weekday by appending an s, which no other
				// language can do; the full sentence translates everywhere.
				return hasTime
					? i18n._({
							...msg({
								message: "Every {day} at {time}",
							}),
							values: { day, time },
						})
					: i18n._({
							...msg({
								message: "Every {day}",
							}),
							values: { day },
						});
			}
			const list = sortDays(byDay)
				.map((d) => formatWeekday(d, "short", locale))
				.join(", ");
			return hasTime
				? i18n._({
						...msg({
							message: "{days} at {time}",
						}),
						values: { days: list, time },
					})
				: list;
		}

		case "MONTHLY": {
			if (interval !== 1) return custom();
			if (byMonthDay === -1) {
				return hasTime
					? i18n._({
							...msg({
								message: "Last day of each month at {time}",
							}),
							values: { time },
						})
					: i18n._(
							msg({
								message: "Last day of each month",
							}),
						);
			}
			if (byMonthDay !== null && byMonthDay >= 1 && byMonthDay <= 31) {
				// The ordinal suffix is part of the message, not computed in code:
				// a hardcoded st/nd/rd/th leaked English into every locale
				// ("毎月1st"). ICU selectordinal gives each language its own system.
				return hasTime
					? i18n._({
							...msg({
								message:
									"Monthly on the {day, selectordinal, one {#st} two {#nd} few {#rd} other {#th}} at {time}",
							}),
							values: { day: byMonthDay, time },
						})
					: i18n._({
							...msg({
								message:
									"Monthly on the {day, selectordinal, one {#st} two {#nd} few {#rd} other {#th}}",
							}),
							values: { day: byMonthDay },
						});
			}
			if (byDay.length === 1) {
				const day = formatWeekday(byDay[0] as string, "long", locale);
				return hasTime
					? i18n._({
							...msg({
								message: "Monthly on {day} at {time}",
							}),
							values: { day, time },
						})
					: i18n._({
							...msg({
								message: "Monthly on {day}",
							}),
							values: { day },
						});
			}
			return hasTime
				? i18n._({
						...msg({
							message: "Monthly at {time}",
						}),
						values: { time },
					})
				: i18n._(msg({ message: "Monthly" }));
		}

		case "YEARLY": {
			if (interval !== 1) return custom();
			if (byMonth !== null && byMonthDay !== null) {
				const date = `${formatMonth(byMonth, locale)} ${byMonthDay}`;
				return hasTime
					? i18n._({
							...msg({
								message: "Annually on {date} at {time}",
							}),
							values: { date, time },
						})
					: i18n._({
							...msg({
								message: "Annually on {date}",
							}),
							values: { date },
						});
			}
			return hasTime
				? i18n._({
						...msg({
							message: "Annually at {time}",
						}),
						values: { time },
					})
				: i18n._(msg({ message: "Annually" }));
		}

		default:
			return custom();
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

/**
 * True when the rule ends (COUNT or UNTIL). Schedules are repeating only —
 * a rule that runs out is refused at save so no trigger ever needs retiring.
 */
export function hasFiniteRecurrence(rrule: string): boolean {
	const parts = parseRruleParts(rrule);
	return parts !== null && ("COUNT" in parts || "UNTIL" in parts);
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

/**
 * True when the string is a parseable RRULE body with at least one future
 * occurrence — mirrors the check `automation.update` runs server-side, so
 * editors can gate saves instead of persisting rules the server will reject.
 */
export function isValidRrule(rrule: string): boolean {
	return rruleProblem(rrule) === null;
}

/**
 * Why a rule can't be saved: `unparseable` (not an RRULE at all) or
 * `exhausted` (well-formed, but COUNT/UNTIL leaves nothing in the future —
 * a run-once schedule that already ran looks exactly like this). Null when
 * the rule is fine.
 */
export function rruleProblem(
	rrule: string,
): "unparseable" | "exhausted" | null {
	if (!parseRruleParts(rrule)) return "unparseable";
	try {
		const next = nextOccurrenceAfter({
			rrule,
			dtstart: new Date(),
			timezone: "UTC",
			after: new Date(),
		});
		return next === null ? "exhausted" : null;
	} catch {
		return "unparseable";
	}
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
/**
 * "America/Los_Angeles" → "PDT".
 *
 * DST-dependent, so it is resolved against an instant rather than the zone
 * alone — the same zone reads PST for half the year.
 */
export function timezoneAbbreviation(
	timezone: string,
	at: Date = new Date(),
): string {
	try {
		return (
			new Intl.DateTimeFormat("en-US", {
				timeZone: timezone,
				timeZoneName: "short",
			})
				.formatToParts(at)
				.find((part) => part.type === "timeZoneName")?.value ?? timezone
		);
	} catch {
		return timezone;
	}
}

export function formatDateTimeInTimezone(
	date: Date,
	timezone: string,
	options: FormatDateTimeInTimezoneOptions = {},
): string {
	// Same reasoning as describeSchedule: follow the app locale, not the OS.
	const locale = options.locale ?? i18n.locale;
	try {
		return new Intl.DateTimeFormat(locale, {
			...DATE_TIME_IN_TIMEZONE_FORMAT_OPTIONS,
			timeZone: timezone,
		}).format(date);
	} catch {
		return new Intl.DateTimeFormat(locale, {
			...DATE_TIME_IN_TIMEZONE_FORMAT_OPTIONS,
			timeZone: "UTC",
		}).format(date);
	}
}
