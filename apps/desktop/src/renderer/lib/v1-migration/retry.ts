/**
 * Failure classes the next pass can plausibly clear on its own: the cloud
 * API or host-service being briefly unreachable. Anything else (bad path,
 * not a git repo, detached HEAD, host not set up) needs the user, so a
 * same-session retry would only burn the schedule.
 */
const TRANSIENT_PATTERNS: readonly RegExp[] = [
	/network error/,
	/failed to fetch/,
	/fetch failed/,
	/load failed/,
	/econnrefused/,
	/econnreset/,
	/etimedout/,
	/socket hang up/,
	/service_unavailable/,
	/host-service.*(not reachable|unreachable|not running|unavailable)/,
	/(not reachable|unreachable|cannot reach|could not reach).*host-service/,
];

export function isTransientV1MigrationFailure(reason: string): boolean {
	const normalized = reason.toLowerCase();
	return TRANSIENT_PATTERNS.some((pattern) => pattern.test(normalized));
}

const RETRY_DELAYS_MS = [30_000, 2 * 60_000, 5 * 60_000] as const;

/** `null` once the schedule is exhausted: give up until the next boot. */
export function nextV1MigrationRetryDelayMs(attempt: number): number | null {
	if (!Number.isInteger(attempt) || attempt < 1) return null;
	return RETRY_DELAYS_MS[attempt - 1] ?? null;
}
