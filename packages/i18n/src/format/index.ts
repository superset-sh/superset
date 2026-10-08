import { i18n } from "../index";
import { DEFAULT_LOCALE } from "../locales";

// Locale-aware wrappers around Intl.*. Every user-facing number, currency,
// and date goes through these instead of hardcoding a locale — the active
// locale defaults to the shared instance. SSR callers can pass their request's
// locale explicitly. React consumers use useFormat from @superset/i18n/react
// to subscribe to changes without remounting application state.
//
// Constructing an Intl formatter per call costs single-digit microseconds
// (measured: ~5µs NumberFormat, ~19µs DateTimeFormat), which is negligible at
// our call rates — so these are plain constructions, no caching.

export function getActiveLocale(): string {
	return i18n.locale || DEFAULT_LOCALE;
}

export function formatNumber(
	value: number,
	options?: Intl.NumberFormatOptions,
	locale = getActiveLocale(),
): string {
	return new Intl.NumberFormat(locale, options).format(value);
}

// 0.123 -> "12.3%"
export function formatPercent(
	value: number,
	options?: Intl.NumberFormatOptions,
	locale = getActiveLocale(),
): string {
	return formatNumber(
		value,
		{
			style: "percent",
			maximumFractionDigits: 1,
			...options,
		},
		locale,
	);
}

export function formatList(
	values: string[],
	options?: Intl.ListFormatOptions,
	locale = getActiveLocale(),
): string {
	return new Intl.ListFormat(locale, {
		style: "long",
		type: "conjunction",
		...options,
	}).format(values);
}

// 123400 -> "123K"
export function formatCompactNumber(
	value: number,
	options?: Intl.NumberFormatOptions,
	locale = getActiveLocale(),
): string {
	return formatNumber(value, { notation: "compact", ...options }, locale);
}

// Major units: formatCurrency(12.5, "USD") -> "$12.50"
export function formatCurrency(
	value: number,
	currency = "USD",
	options?: Intl.NumberFormatOptions,
	locale = getActiveLocale(),
): string {
	return formatNumber(
		value,
		{
			style: "currency",
			currency: currency.toUpperCase(),
			...options,
		},
		locale,
	);
}

// Stripe-style minor units: formatPrice(1250, "usd") -> "$12.50"
export function formatPrice(
	amountInCents: number,
	currency: string,
	locale = getActiveLocale(),
): string {
	return formatCurrency(amountInCents / 100, currency, undefined, locale);
}

export function formatDate(
	date: Date | number,
	options: Intl.DateTimeFormatOptions = {
		year: "numeric",
		month: "short",
		day: "numeric",
	},
	locale = getActiveLocale(),
): string {
	return new Intl.DateTimeFormat(locale, options).format(date);
}

export function formatDateTime(
	date: Date | number,
	options: Intl.DateTimeFormatOptions = {
		dateStyle: "medium",
		timeStyle: "short",
	},
	locale = getActiveLocale(),
): string {
	return new Intl.DateTimeFormat(locale, options).format(date);
}

// Relative time: -3600_000 -> "1 hour ago", 86_400_000 -> "tomorrow".
// `numeric: "auto"` lets the locale use idiomatic wording ("yesterday")
// where it has one.
const RELATIVE_UNITS: Array<[Intl.RelativeTimeFormatUnit, number]> = [
	["year", 365 * 24 * 60 * 60 * 1000],
	["month", 30 * 24 * 60 * 60 * 1000],
	["week", 7 * 24 * 60 * 60 * 1000],
	["day", 24 * 60 * 60 * 1000],
	["hour", 60 * 60 * 1000],
	["minute", 60 * 1000],
	["second", 1000],
];

export function formatRelativeTime(
	date: Date | number,
	now: Date | number = Date.now(),
	options: Intl.RelativeTimeFormatOptions = { numeric: "auto" },
	locale = getActiveLocale(),
): string {
	const diffMs =
		(date instanceof Date ? date.getTime() : date) -
		(now instanceof Date ? now.getTime() : now);
	const formatter = new Intl.RelativeTimeFormat(locale, options);
	for (const [unit, ms] of RELATIVE_UNITS) {
		if (Math.abs(diffMs) >= ms) {
			return formatter.format(Math.round(diffMs / ms), unit);
		}
	}
	return new Intl.RelativeTimeFormat(locale, {
		...options,
		numeric: "auto",
	}).format(0, "second");
}

const MINUTE_MS = 60 * 1000;

// Compact age for dense UI: "3d", "2w", "5m". Locale-aware via
// `style: "narrow"`, which most locales render without a leading article.
export function formatCompactRelativeTime(
	date: Date | number,
	now: Date | number = Date.now(),
	locale = getActiveLocale(),
): string {
	const diffMs =
		(date instanceof Date ? date.getTime() : date) -
		(now instanceof Date ? now.getTime() : now);
	if (Math.abs(diffMs) < MINUTE_MS) {
		return formatRelativeTime(date, date, { numeric: "auto" }, locale);
	}
	const narrow = formatRelativeTime(
		date,
		now,
		{ numeric: "always", style: "narrow" },
		locale,
	);
	// French and Russian narrow past forms are a bare sign ("-5 min"), which
	// reads as a negative number.
	return /^[-+\u2212]/.test(narrow)
		? formatRelativeTime(
				date,
				now,
				{ numeric: "always", style: "short" },
				locale,
			)
		: narrow;
}

const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;
const WEEK_MS = 7 * DAY_MS;
const YEAR_MS = 365 * DAY_MS;

function ageUnit(
	elapsedMs: number,
): [Intl.NumberFormatOptions["unit"], number] | null {
	if (elapsedMs >= YEAR_MS) return ["year", Math.floor(elapsedMs / YEAR_MS)];
	if (elapsedMs >= 2 * WEEK_MS)
		return ["week", Math.floor(elapsedMs / WEEK_MS)];
	if (elapsedMs >= DAY_MS) return ["day", Math.floor(elapsedMs / DAY_MS)];
	if (elapsedMs >= HOUR_MS) return ["hour", Math.floor(elapsedMs / HOUR_MS)];
	if (elapsedMs >= MINUTE_MS)
		return ["minute", Math.floor(elapsedMs / MINUTE_MS)];
	return null;
}

const formatUnit = (
	locale: string,
	unit: Intl.NumberFormatOptions["unit"],
	count: number,
	unitDisplay: "narrow" | "short",
) =>
	new Intl.NumberFormat(locale, { style: "unit", unit, unitDisplay }).format(
		count,
	);

// Days hand over to weeks at two weeks, so English never needs a third digit.
export function formatAge(
	date: Date | number,
	now: Date | number = Date.now(),
	locale = getActiveLocale(),
): string {
	const elapsedMs =
		(now instanceof Date ? now.getTime() : now) -
		(date instanceof Date ? date.getTime() : date);
	const age = ageUnit(elapsedMs);
	if (!age) {
		return new Intl.RelativeTimeFormat(locale, { numeric: "auto" }).format(
			0,
			"second",
		);
	}
	const [unit, count] = age;
	const narrow = formatUnit(locale, unit, count, "narrow");
	// Some locales have no narrow form for a unit and fall back to English
	// letters ("4w" in Japanese).
	const isLatinScript = new Intl.Locale(locale).maximize().script === "Latn";
	return !isLatinScript && /[a-z]/i.test(narrow)
		? formatUnit(locale, unit, count, "short")
		: narrow;
}

export function formatRelativePeriod(
	{ unit, count }: { unit: "day" | "week" | "month" | "year"; count: number },
	locale = getActiveLocale(),
): string {
	const label = new Intl.RelativeTimeFormat(locale, {
		numeric: "auto",
	}).format(-count, unit);
	return label.charAt(0).toLocaleUpperCase(locale) + label.slice(1);
}
