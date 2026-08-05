/**
 * Compact relative age ("now", "12m", "3h", "6d") from a virtual clock.
 * Prototype-local; the real app uses date-fns formatDistanceToNow.
 */
export function formatAge(now: number, timestamp: number): string {
	const seconds = Math.max(0, Math.round((now - timestamp) / 1000));
	if (seconds < 45) return "now";
	const minutes = Math.round(seconds / 60);
	if (minutes < 60) return `${minutes}m`;
	const hours = Math.round(minutes / 60);
	if (hours < 24) return `${hours}h`;
	const days = Math.round(hours / 24);
	return `${days}d`;
}
