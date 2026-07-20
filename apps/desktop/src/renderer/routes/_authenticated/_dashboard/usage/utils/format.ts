export function formatCompactTokens(value: number): string {
	if (value >= 1_000_000_000) return `${(value / 1_000_000_000).toFixed(1)}B`;
	if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
	if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
	return `${value}`;
}

export function formatUsd(value: number): string {
	return value.toLocaleString(undefined, {
		minimumFractionDigits: 2,
		maximumFractionDigits: 2,
	});
}

export function formatRelativeAgo(from: Date): string {
	const seconds = Math.max(0, Math.round((Date.now() - from.getTime()) / 1000));
	if (seconds < 45) return "just now";
	const minutes = Math.round(seconds / 60);
	if (minutes < 60) return `${minutes}m ago`;
	const hours = Math.round(minutes / 60);
	if (hours < 24) return `${hours}h ago`;
	const days = Math.round(hours / 24);
	return `${days}d ago`;
}

// Humanize a future reset instant into a coarse "20m" / "1d 23h" / "7d" string.
export function formatTimeUntil(target: Date): string {
	const totalMinutes = Math.max(
		0,
		Math.round((target.getTime() - Date.now()) / 60000),
	);
	if (totalMinutes < 60) return `${totalMinutes}m`;
	const totalHours = Math.floor(totalMinutes / 60);
	if (totalHours < 24) {
		const mins = totalMinutes % 60;
		return mins > 0 ? `${totalHours}h ${mins}m` : `${totalHours}h`;
	}
	const days = Math.floor(totalHours / 24);
	const hours = totalHours % 24;
	return hours > 0 ? `${days}d ${hours}h` : `${days}d`;
}
