/**
 * Classifies failures from GitHub, whether they came back as an Octokit
 * RequestError (status + response headers) or as a `gh` exit (stdout/stderr
 * prose, no status). Shared by the PR runtime's availability gate and the
 * search procedures, which must agree on what "rate limited" means.
 */

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null;
}

function githubErrorText(error: unknown): string {
	if (typeof error === "string") return error;
	if (!isRecord(error)) return "";
	const parts: string[] = [];
	if (typeof error.message === "string") parts.push(error.message);
	// execFile errors carry the gh CLI's stderr separately from `message`.
	if (typeof error.stderr === "string") parts.push(error.stderr);
	return parts.join("\n");
}

function statusOf(error: unknown): number | null {
	return isRecord(error) && typeof error.status === "number"
		? error.status
		: null;
}

/**
 * REST rate-limit failures are 403/429 responses whose message mentions
 * "rate limit"; gh CLI failures surface the same text without a status.
 */
export function isGithubRateLimitError(error: unknown): boolean {
	if (!/rate limit/i.test(githubErrorText(error))) return false;
	const status = statusOf(error);
	return status === null || status === 403 || status === 429;
}

/**
 * When GitHub's quota window reopens. Octokit keeps the `x-ratelimit-reset`
 * header on the response; gh prints nothing usable, so its failures yield
 * null and the caller picks a default hold.
 */
export function parseRateLimitReset(error: unknown): Date | null {
	if (isRecord(error) && isRecord(error.response)) {
		const headers = error.response.headers;
		if (isRecord(headers)) {
			const header = headers["x-ratelimit-reset"];
			const epoch =
				typeof header === "number"
					? header
					: typeof header === "string"
						? Number.parseInt(header, 10)
						: Number.NaN;
			if (Number.isFinite(epoch) && epoch > 0) return new Date(epoch * 1000);
		}
	}
	const match = githubErrorText(error).match(
		/x-ratelimit-reset[:=\s]+(\d{9,11})/i,
	);
	const epochText = match?.[1];
	if (epochText) return new Date(Number.parseInt(epochText, 10) * 1000);
	return null;
}

/**
 * Rejected-credential failures: Octokit throws a 401 RequestError ("Bad
 * credentials"); the gh CLI prints the same text (or "HTTP 401") with no
 * status field.
 */
export function isGithubAuthError(error: unknown): boolean {
	if (statusOf(error) === 401) return true;
	return /bad credentials|\bHTTP 401\b/i.test(githubErrorText(error));
}

/**
 * No credential at all: `gh` not logged in, or the credential provider found
 * nothing (the runtime's `github()` throws with `cause.kind` set). Distinct
 * from a rejected credential only in wording; both stop every lookup.
 */
export function isGithubMissingAuthError(error: unknown): boolean {
	if (isRecord(error) && isRecord(error.cause)) {
		if (error.cause.kind === "NO_GITHUB_TOKEN") return true;
	}
	return /gh auth login|authentication required|not logged into any GitHub hosts/i.test(
		githubErrorText(error),
	);
}

/**
 * Multi-repo direct lookups skip repos that simply don't have the number:
 * Octokit throws a 404; gh prints "Could not resolve to a PullRequest…".
 */
export function isGithubNotFoundError(error: unknown): boolean {
	if (statusOf(error) === 404) return true;
	return /could not resolve to|\bnot found\b|HTTP 404/i.test(
		githubErrorText(error),
	);
}
