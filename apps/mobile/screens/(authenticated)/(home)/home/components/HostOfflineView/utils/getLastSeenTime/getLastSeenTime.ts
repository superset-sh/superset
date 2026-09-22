/**
 * The relay stamps last-seen with its own clock, which can run ahead of the
 * phone's. Unclamped, that renders as "Last seen in 3 seconds".
 */
export function getLastSeenTime(lastSeenAt: number, now: number): number {
	return Math.min(lastSeenAt, now);
}
