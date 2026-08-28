import { i18n } from "../index";
import { DEFAULT_LOCALE } from "../locales";

// Locale-aware wrappers around Intl.*. Every user-facing number, currency,
// and date goes through these instead of hardcoding a locale — the active
// locale comes from the shared i18n instance, and I18nProvider remounts its
// subtree on locale change so formatted output re-renders everywhere.
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
): string {
	return new Intl.NumberFormat(getActiveLocale(), options).format(value);
}

// 0.123 -> "12.3%"
export function formatPercent(
	value: number,
	options?: Intl.NumberFormatOptions,
): string {
	return formatNumber(value, {
		style: "percent",
		maximumFractionDigits: 1,
		...options,
	});
}

// 123400 -> "123K"
export function formatCompactNumber(
	value: number,
	options?: Intl.NumberFormatOptions,
): string {
	return formatNumber(value, { notation: "compact", ...options });
}

// Major units: formatCurrency(12.5, "USD") -> "$12.50"
export function formatCurrency(
	value: number,
	currency = "USD",
	options?: Intl.NumberFormatOptions,
): string {
	return formatNumber(value, {
		style: "currency",
		currency: currency.toUpperCase(),
		...options,
	});
}

// Stripe-style minor units: formatPrice(1250, "usd") -> "$12.50"
export function formatPrice(amountInCents: number, currency: string): string {
	return formatCurrency(amountInCents / 100, currency);
}

export function formatDate(
	date: Date | number,
	options: Intl.DateTimeFormatOptions = {
		year: "numeric",
		month: "short",
		day: "numeric",
	},
): string {
	return new Intl.DateTimeFormat(getActiveLocale(), options).format(date);
}

export function formatDateTime(
	date: Date | number,
	options: Intl.DateTimeFormatOptions = {
		dateStyle: "medium",
		timeStyle: "short",
	},
): string {
	return new Intl.DateTimeFormat(getActiveLocale(), options).format(date);
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
): string {
	const diffMs =
		(date instanceof Date ? date.getTime() : date) -
		(now instanceof Date ? now.getTime() : now);
	const formatter = new Intl.RelativeTimeFormat(getActiveLocale(), options);
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
): string {
	return formatRelativeTime(date, now, { numeric: "always", style: "narrow" });
}
