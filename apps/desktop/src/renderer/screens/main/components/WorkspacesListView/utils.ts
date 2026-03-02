// Time unit constants (in milliseconds)
const MS_PER_SECOND = 1000;
const MS_PER_MINUTE = MS_PER_SECOND * 60;
const MS_PER_HOUR = MS_PER_MINUTE * 60;
const MS_PER_DAY = MS_PER_HOUR * 24;

// Time threshold constants (in their respective units)
const MINUTES_PER_HOUR = 60;
const HOURS_PER_DAY = 24;
const DAYS_PER_WEEK = 7;
const DAYS_PER_MONTH = 30;
const DAYS_PER_YEAR = 365;

// Relative time display thresholds (in days)
const TWO_WEEKS_DAYS = 14;
const TWO_MONTHS_DAYS = 60;

/**
 * Returns a human-readable relative time string
 * e.g., "2 hours ago", "yesterday", "3 days ago"
 */
export function getRelativeTime(timestamp: number): string {
	const now = Date.now();
	const diff = now - timestamp;

	const minutes = Math.floor(diff / MS_PER_MINUTE);
	const hours = Math.floor(diff / MS_PER_HOUR);
	const days = Math.floor(diff / MS_PER_DAY);

	if (minutes < 1) return "just now";
	if (minutes < MINUTES_PER_HOUR) return `${minutes}m ago`;
	if (hours < HOURS_PER_DAY) return `${hours}h ago`;
	if (days === 1) return "yesterday";
	if (days < DAYS_PER_WEEK) return `${days} days ago`;
	if (days < TWO_WEEKS_DAYS) return "1 week ago";
	if (days < DAYS_PER_MONTH)
		return `${Math.floor(days / DAYS_PER_WEEK)} weeks ago`;
	if (days < TWO_MONTHS_DAYS) return "1 month ago";
	if (days < DAYS_PER_YEAR)
		return `${Math.floor(days / DAYS_PER_MONTH)} months ago`;
	return "over a year ago";
}
