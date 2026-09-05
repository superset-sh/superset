/**
 * Circuit breaker for the PR runtime's GitHub calls.
 *
 * When GitHub cannot be reached at all (DNS down, VPN dropped, captive
 * portal), every lookup fails the same way, and each one costs a `gh` spawn
 * that sits on its 10s timeout before we fall back to Octokit and fail again.
 * With dozens of repos polled on a cadence, one broken resolver turned into
 * thousands of spawned-and-killed `gh` processes on a machine that was already
 * struggling to exec anything. Per-repo cache backoff never helped: the
 * failure is per network, not per repo.
 *
 * The gate trips on the first transport-level failure and holds every GitHub
 * call for a growing window (1 min, doubling, capped at 30 min). Any success
 * closes it. HTTP-level failures (404, 403 rate limit, 5xx) never trip it:
 * those mean GitHub answered, and the per-repo cache backoff already covers
 * them.
 */

const BASE_BLOCK_MS = 60_000;
const MAX_BLOCK_MS = 30 * 60_000;

/**
 * Node and undici codes meaning the request never reached GitHub. Same family
 * as the cloud-API unreachable list, minus the TLS-interception codes: a
 * corporate proxy that re-signs github.com is a reason to stop retrying too,
 * but it reports as a different problem and is left to surface as one.
 */
const UNREACHABLE_CODES = new Set([
	"ECONNREFUSED",
	"ECONNRESET",
	"ETIMEDOUT",
	"ENOTFOUND",
	"EAI_AGAIN",
	"EHOSTUNREACH",
	"ENETUNREACH",
	"UND_ERR_CONNECT_TIMEOUT",
	"UND_ERR_HEADERS_TIMEOUT",
	"UND_ERR_SOCKET",
]);

// `gh` reports transport failures as prose on stderr. These are Go's net
// package phrasings, stable across gh releases.
const UNREACHABLE_STDERR =
	/no such host|dial tcp|i\/o timeout|connect timeout|tls handshake timeout|network is unreachable|connection refused|connection reset|getaddrinfo/i;

const MAX_CAUSE_DEPTH = 8;

function codeOf(value: unknown): string | null {
	if (typeof value !== "object" || value === null) return null;
	const code = (value as { code?: unknown }).code;
	return typeof code === "string" ? code : null;
}

function textOf(value: unknown): string {
	if (typeof value !== "object" || value === null) return "";
	const { stderr, message } = value as { stderr?: unknown; message?: unknown };
	return [stderr, message]
		.filter((part): part is string => typeof part === "string")
		.join("\n");
}

export function isGitHubUnreachableError(error: unknown): boolean {
	let current: unknown = error;
	for (let depth = 0; depth < MAX_CAUSE_DEPTH && current; depth++) {
		const code = codeOf(current);
		if (code && UNREACHABLE_CODES.has(code)) return true;
		// execFile's timeout: the child was killed before it produced a result.
		// For `gh` that is a hung network call; a fast failure exits on its own.
		const { killed, signal } = current as {
			killed?: unknown;
			signal?: unknown;
		};
		if (killed === true && typeof signal === "string") return true;
		if (UNREACHABLE_STDERR.test(textOf(current))) return true;
		current = (current as { cause?: unknown }).cause;
	}
	return false;
}

export class GitHubUnreachableError extends Error {
	constructor(public readonly retryAfterMs: number) {
		super(
			`GitHub is unreachable from this host; skipping the lookup for ${Math.ceil(retryAfterMs / 1000)}s`,
		);
		this.name = "GitHubUnreachableError";
	}
}

export class GitHubReachabilityGate {
	private streak = 0;
	private blockedUntil = 0;
	private readonly now: () => number;

	constructor(options: { now?: () => number } = {}) {
		this.now = options.now ?? Date.now;
	}

	/** Milliseconds until the gate reopens; 0 when calls may proceed. */
	retryAfterMs(): number {
		return Math.max(0, this.blockedUntil - this.now());
	}

	/** Throws while the gate is holding calls. */
	assertReachable(): void {
		const wait = this.retryAfterMs();
		if (wait > 0) throw new GitHubUnreachableError(wait);
	}

	/**
	 * Records a failed call. Returns the hold window it opened when the error
	 * was a transport failure, or null when the error means GitHub answered
	 * and the gate should stay out of it.
	 */
	recordFailure(error: unknown): number | null {
		if (!isGitHubUnreachableError(error)) return null;
		this.streak += 1;
		const block = Math.min(
			BASE_BLOCK_MS * 2 ** (this.streak - 1),
			MAX_BLOCK_MS,
		);
		this.blockedUntil = this.now() + block;
		return block;
	}

	recordSuccess(): void {
		this.streak = 0;
		this.blockedUntil = 0;
	}
}
