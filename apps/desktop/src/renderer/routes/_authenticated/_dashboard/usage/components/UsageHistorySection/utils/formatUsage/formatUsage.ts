/** "$19,211", "$46.20", "$0.85" — whole dollars once past $100. */
export function formatUsd(usd: number): string {
	if (usd >= 100) {
		return `$${Math.round(usd).toLocaleString("en-US")}`;
	}
	return `$${usd.toFixed(2)}`;
}

/** "13.9B", "4.2M", "850K", "312" */
export function formatTokens(tokens: number): string {
	if (tokens >= 1e9) return `${(tokens / 1e9).toFixed(1)}B`;
	if (tokens >= 1e6) return `${(tokens / 1e6).toFixed(1)}M`;
	if (tokens >= 1e3) return `${Math.round(tokens / 1e3)}K`;
	return String(Math.round(tokens));
}

/** "Aug 12" from a `YYYY-MM-DD` bucket key. */
export function formatDayLabel(day: string): string {
	const [year, month, date] = day.split("-").map(Number);
	if (!year || !month || !date) return day;
	return new Date(year, month - 1, date).toLocaleDateString(undefined, {
		month: "short",
		day: "numeric",
	});
}
