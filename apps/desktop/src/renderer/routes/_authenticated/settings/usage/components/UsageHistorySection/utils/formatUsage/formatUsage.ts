import { formatCurrency, formatDate } from "@superset/i18n/format";

export { formatTokens } from "@superset/shared/format-tokens";

/** "$19,211", "$46.20", "$0.85" — whole dollars once past $100. */
export function formatUsd(usd: number): string {
	if (usd >= 100) {
		return formatCurrency(usd, "USD", { maximumFractionDigits: 0 });
	}
	return formatCurrency(usd);
}

/** "Aug 12" from a `YYYY-MM-DD` bucket key. */
export function formatDayLabel(day: string): string {
	const [year, month, date] = day.split("-").map(Number);
	if (!year || !month || !date) return day;
	return formatDate(new Date(year, month - 1, date), {
		month: "short",
		day: "numeric",
	});
}
