/** Formats the time until a quota window resets, e.g. "2d 4h", "3h 12m", "14m". */
export function formatResetIn(resetsAt: Date, now: Date = new Date()): string {
	const diffMs = resetsAt.getTime() - now.getTime();
	if (diffMs <= 0) return "now";

	const totalMinutes = Math.ceil(diffMs / 60_000);
	const days = Math.floor(totalMinutes / (60 * 24));
	const hours = Math.floor((totalMinutes % (60 * 24)) / 60);
	const minutes = totalMinutes % 60;

	if (days > 0) return hours > 0 ? `${days}d ${hours}h` : `${days}d`;
	if (hours > 0) return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
	return `${minutes}m`;
}

/**
 * Full reset caption: countdown plus the absolute time — clock time when the
 * reset lands within 24h, date otherwise. e.g. "Resets in 2h 10m · 3:22 PM",
 * "Resets in 5d 13h · Aug 21".
 */
export function formatResetLabel(
	resetsAt: Date,
	now: Date = new Date(),
): string {
	const diffMs = resetsAt.getTime() - now.getTime();
	if (diffMs <= 0) return "Resets now";

	const within24h = diffMs < 24 * 60 * 60 * 1000;
	const absolute = within24h
		? resetsAt.toLocaleTimeString(undefined, {
				hour: "numeric",
				minute: "2-digit",
			})
		: resetsAt.toLocaleDateString(undefined, {
				month: "short",
				day: "numeric",
			});
	return `Resets in ${formatResetIn(resetsAt, now)} · ${absolute}`;
}
