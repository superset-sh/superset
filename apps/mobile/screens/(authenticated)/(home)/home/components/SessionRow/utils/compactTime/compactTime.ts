const MINUTE_MS = 60_000;
const HOUR_MS = 3_600_000;
const DAY_MS = 86_400_000;

export function compactTime(timestampMs: number, nowMs = Date.now()): string {
	const elapsed = Math.max(0, nowMs - timestampMs);
	if (elapsed < MINUTE_MS) return "now";
	if (elapsed < HOUR_MS) return `${Math.floor(elapsed / MINUTE_MS)}m`;
	if (elapsed < DAY_MS) return `${Math.floor(elapsed / HOUR_MS)}h`;
	return `${Math.floor(elapsed / DAY_MS)}d`;
}
