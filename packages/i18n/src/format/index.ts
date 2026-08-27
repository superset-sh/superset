import { i18n } from "../index";
import { DEFAULT_LOCALE } from "../locales";

// Locale-aware wrappers around Intl.*. Every user-facing number, currency,
// and date must go through these instead of hardcoding a locale — the active
// locale comes from the shared i18n instance, so a language change reformats
// everything without threading a locale through props.

export function getActiveLocale(): string {
	return i18n.locale || DEFAULT_LOCALE;
}

// Intl constructors are expensive; several call sites run in render paths.
const numberFormatCache = new Map<string, Intl.NumberFormat>();
const dateFormatCache = new Map<string, Intl.DateTimeFormat>();

function numberFormatter(
	options?: Intl.NumberFormatOptions,
): Intl.NumberFormat {
	const locale = getActiveLocale();
	const key = `${locale}|${JSON.stringify(options ?? {})}`;
	let formatter = numberFormatCache.get(key);
	if (!formatter) {
		formatter = new Intl.NumberFormat(locale, options);
		numberFormatCache.set(key, formatter);
	}
	return formatter;
}

function dateFormatter(
	options?: Intl.DateTimeFormatOptions,
): Intl.DateTimeFormat {
	const locale = getActiveLocale();
	const key = `${locale}|${JSON.stringify(options ?? {})}`;
	let formatter = dateFormatCache.get(key);
	if (!formatter) {
		formatter = new Intl.DateTimeFormat(locale, options);
		dateFormatCache.set(key, formatter);
	}
	return formatter;
}

export function formatNumber(
	value: number,
	options?: Intl.NumberFormatOptions,
): string {
	return numberFormatter(options).format(value);
}

// 0.123 -> "12.3%"
export function formatPercent(
	value: number,
	options?: Intl.NumberFormatOptions,
): string {
	return numberFormatter({
		style: "percent",
		maximumFractionDigits: 1,
		...options,
	}).format(value);
}

// 123400 -> "123K"
export function formatCompactNumber(
	value: number,
	options?: Intl.NumberFormatOptions,
): string {
	return numberFormatter({ notation: "compact", ...options }).format(value);
}

// Major units: formatCurrency(12.5, "USD") -> "$12.50"
export function formatCurrency(
	value: number,
	currency = "USD",
	options?: Intl.NumberFormatOptions,
): string {
	return numberFormatter({
		style: "currency",
		currency: currency.toUpperCase(),
		...options,
	}).format(value);
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
	return dateFormatter(options).format(date);
}

export function formatDateTime(
	date: Date | number,
	options: Intl.DateTimeFormatOptions = {
		dateStyle: "medium",
		timeStyle: "short",
	},
): string {
	return dateFormatter(options).format(date);
}
