import {
	formatCompactNumber,
	formatCurrency,
	formatDate,
	formatNumber,
	getActiveLocale,
} from "@superset/i18n/format";
import { formatScaled, type ScaleUnit } from "@superset/shared/format-scaled";
import { differenceInCalendarDays, parseISO } from "date-fns";

export { formatTokens } from "@superset/shared/format-tokens";

const USD_UNITS: readonly ScaleUnit[] = [
	{ limit: 1e6, suffix: "M", digits: 2 },
	{ limit: 1e3, suffix: "K", digits: 1 },
];

const COUNT_UNITS: readonly ScaleUnit[] = [
	{ limit: 1e6, suffix: "M", digits: 1 },
	{ limit: 1e3, suffix: "K", digits: 1 },
];

export function formatUsd(
	usd: string | number,
	locale = getActiveLocale(),
): string {
	const value = typeof usd === "string" ? Number.parseFloat(usd) : usd;
	if (!Number.isFinite(value))
		return formatCurrency(0, "USD", { maximumFractionDigits: 0 }, locale);
	if (!locale.startsWith("en"))
		return formatCurrency(
			value,
			"USD",
			{ notation: "compact", maximumFractionDigits: 2 },
			locale,
		);
	return `$${formatScaled(value, USD_UNITS, (raw) => raw.toFixed(2))}`;
}

export function formatCount(value: number, locale = getActiveLocale()): string {
	if (!locale.startsWith("en"))
		return formatCompactNumber(value, { maximumFractionDigits: 1 }, locale);
	return formatScaled(value, COUNT_UNITS, (raw) =>
		formatNumber(raw, undefined, locale),
	);
}

export function formatDayRange(
	range: { from: string; to: string },
	locale = getActiveLocale(),
) {
	return `${formatDate(parseISO(range.from), { month: "short", day: "numeric" }, locale)} – ${formatDate(parseISO(range.to), { month: "short", day: "numeric" }, locale)}`;
}

export function dayCount(range: { from: string; to: string } | null): number {
	if (!range) return 0;
	return differenceInCalendarDays(parseISO(range.to), parseISO(range.from)) + 1;
}
