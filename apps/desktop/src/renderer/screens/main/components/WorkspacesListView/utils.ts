/**
 * Returns a human-readable relative time string
 * e.g., "2 hours ago", "yesterday", "3 days ago"
 */
export function getRelativeTime(timestamp: number): string {
	const now = Date.now();
	const diff = now - timestamp;

	const minutes = Math.floor(diff / (1000 * 60));
	const hours = Math.floor(diff / (1000 * 60 * 60));
	const days = Math.floor(diff / (1000 * 60 * 60 * 24));

	if (minutes < 1) return "just now";
	if (minutes < 60) return `${minutes}m ago`;
	if (hours < 24) return `${hours}h ago`;
	if (days === 1) return "yesterday";
	if (days < 7) return `${days} days ago`;
	if (days < 14) return "1 week ago";
	if (days < 30) return `${Math.floor(days / 7)} weeks ago`;
	if (days < 60) return "1 month ago";
	if (days < 365) return `${Math.floor(days / 30)} months ago`;
	return "over a year ago";
}

/**
 * Format timestamp as short date (e.g., "Mar 15")
 */
export function formatDate(timestamp: number): string {
	const date = new Date(timestamp);
	return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}
