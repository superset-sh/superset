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

/**
 * The pass reached a host-service older than this desktop: it does not know a
 * procedure the migration calls, or (1.23.x and older) rejects queries sent
 * as POST. That is a still-running host-service adopted after a desktop
 * update, so a retry against the same process fails the same way.
 */
const HOST_VERSION_SKEW_PATTERNS: readonly RegExp[] = [
	/no procedure found on path/,
	/procedure .* not found on server/,
	/unsupported post-request to query procedure/,
];

export function isHostVersionSkewV1MigrationFailure(reason: string): boolean {
	const normalized = reason.toLowerCase();
	return HOST_VERSION_SKEW_PATTERNS.some((pattern) => pattern.test(normalized));
}

const RETRY_DELAYS_MS = [30_000, 2 * 60_000, 5 * 60_000] as const;

/** `null` once the schedule is exhausted: give up until the next boot. */
export function nextV1MigrationRetryDelayMs(attempt: number): number | null {
	if (!Number.isInteger(attempt) || attempt < 1) return null;
	return RETRY_DELAYS_MS[attempt - 1] ?? null;
}
