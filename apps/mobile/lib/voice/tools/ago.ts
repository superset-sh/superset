/**
 * English relative time for tool outputs. The model, not the user, reads
 * these — it speaks them back in whatever language the conversation is in —
 * so they stay out of Lingui on purpose.
 */
export function ago(timestamp: number | null, now: number): string | null {
	if (timestamp === null) return null;
	const seconds = Math.max(0, Math.round((now - timestamp) / 1000));
	if (seconds < 60) return "just now";
	const minutes = Math.round(seconds / 60);
	if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"} ago`;
	const hours = Math.round(minutes / 60);
	if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
	const days = Math.round(hours / 24);
	return `${days} day${days === 1 ? "" : "s"} ago`;
}
