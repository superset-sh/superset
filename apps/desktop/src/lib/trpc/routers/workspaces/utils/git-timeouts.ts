/** 10s — config reads, rev-parse, local-only commands */
export const GIT_TIMEOUT_LOCAL = 10_000;

/** 30s — fetch single branch, ls-remote, gh API calls */
export const GIT_TIMEOUT_NETWORK = 30_000;

/** 60s — push, pull (significant data transfer) */
export const GIT_TIMEOUT_NETWORK_HEAVY = 60_000;

/** 120s — worktree creation, large fetches (e.g. fork PRs) */
export const GIT_TIMEOUT_LONG = 120_000;

export function isTimeoutError(error: unknown): boolean {
	return (
		error instanceof Error &&
		"killed" in error &&
		(error as any).killed === true
	);
}

export function wrapTimeoutError(error: unknown, operation: string): Error {
	if (isTimeoutError(error)) {
		return new Error(
			`${operation} timed out. Check your network connection and try again.`,
		);
	}
	return error instanceof Error ? error : new Error(String(error));
}
