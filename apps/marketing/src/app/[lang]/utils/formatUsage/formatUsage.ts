import { formatScaled, type ScaleUnit } from "@superset/shared/format-scaled";
import { differenceInCalendarDays, format, parseISO } from "date-fns";

export { formatTokens } from "@superset/shared/format-tokens";

const USD_UNITS: readonly ScaleUnit[] = [
	{ limit: 1e6, suffix: "M", digits: 2 },
	{ limit: 1e3, suffix: "K", digits: 1 },
];

const COUNT_UNITS: readonly ScaleUnit[] = [
	{ limit: 1e6, suffix: "M", digits: 1 },
	{ limit: 1e3, suffix: "K", digits: 1 },
];

export function formatUsd(usd: string | number): string {
	const value = typeof usd === "string" ? Number.parseFloat(usd) : usd;
	if (!Number.isFinite(value)) return "$0";
	return `$${formatScaled(value, USD_UNITS, (raw) => raw.toFixed(2))}`;
}

export function formatCount(value: number): string {
	return formatScaled(value, COUNT_UNITS, (raw) => raw.toLocaleString("en-US"));
}

export function formatDayRange(range: { from: string; to: string } | null) {
	if (!range) return "All time";
	return `${format(parseISO(range.from), "MMM d")} – ${format(parseISO(range.to), "MMM d")}`;
}

export function dayCount(range: { from: string; to: string } | null): number {
	if (!range) return 0;
	return differenceInCalendarDays(parseISO(range.to), parseISO(range.from)) + 1;
}
