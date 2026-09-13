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
	return formatter.format(0, "second");
}

// Compact age for dense UI: "3d", "2w", "5m". Locale-aware via
// `style: "narrow"`, which most locales render without a leading article.
export function formatCompactRelativeTime(
	date: Date | number,
	now: Date | number = Date.now(),
	locale = getActiveLocale(),
): string {
	return formatRelativeTime(
		date,
		now,
		{ numeric: "always", style: "narrow" },
		locale,
	);
}

const DURATION_UNITS: readonly [Intl.NumberFormatOptions["unit"], number][] = [
	["hour", 3_600_000],
	["minute", 60_000],
	["second", 1_000],
];

// Compact elapsed time for dense UI: "42s", "3m", "2h". Locale-aware via
// `unitDisplay: "narrow"`; never negative, never below one second.
export function formatCompactDuration(
	ms: number,
	locale = getActiveLocale(),
): string {
	const clamped = Math.max(0, ms);
	const [unit, unitMs] =
		DURATION_UNITS.find(([, size]) => clamped >= size) ??
		DURATION_UNITS[DURATION_UNITS.length - 1];
	const value = Math.max(1, Math.floor(clamped / unitMs));
	return new Intl.NumberFormat(locale, {
		style: "unit",
		unit,
		unitDisplay: "narrow",
	}).format(value);
}
