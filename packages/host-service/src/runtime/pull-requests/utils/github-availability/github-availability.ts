import {
	isGithubAuthError,
	isGithubMissingAuthError,
	isGithubRateLimitError,
	parseRateLimitReset,
} from "../github-errors";

/**
 * Circuit breaker for the PR runtime's GitHub calls.
 *
 * Three failures are properties of this host, not of any one repo, so one of
 * them makes every further lookup pointless until something changes:
 *
 * - **unreachable**: DNS down, VPN dropped, captive portal. Each lookup costs
 *   a `gh` spawn that sits on its 10s timeout before the Octokit fallback
 *   fails the same way; with dozens of repos polled on a cadence that turned
 *   into thousands of spawned-and-killed processes on a struggling machine.
 *   Held for a growing window (1 min, doubling, capped at 30 min).
 * - **rate-limited**: the user's GitHub quota is spent. The runtime is the
 *   usual culprit (SUPER-2107), and every retry before the window resets is
 *   another 403 that keeps PR links from ever being created. Held until the
 *   reset GitHub reported, or 5 min when it reported none.
 * - **auth**: GitHub rejected the credential. Nothing heals that but the
 *   user, so it holds with the unreachable backoff and stays visible.
 *
 * Any success reopens the gate. Other answers from GitHub (404, 5xx) never
 * trip it; the per-repo cache backoff covers those.
 *
 * `status()` is what the UI shows: the sweep keeps existing PR links across a
 * hold but cannot create new ones, and without the readout that looks like
 * "PRs stopped showing up" with nothing to explain it.
 */

const BASE_BLOCK_MS = 60_000;
const MAX_BLOCK_MS = 30 * 60_000;
const RATE_LIMIT_DEFAULT_HOLD_MS = 5 * 60_000;
// GitHub's window is an hour; a reset further out than that is a clock skew.
const RATE_LIMIT_MAX_HOLD_MS = 65 * 60_000;
// Land just past the reset so the first retry is not a second 403.
const RATE_LIMIT_RESET_SLACK_MS = 5_000;

export type GitHubHoldReason = "unreachable" | "rate-limited" | "auth";

export interface GitHubAvailabilityStatus {
	reason: GitHubHoldReason;
	/** Epoch ms of the failure that opened the current hold. */
	since: number;
	/** Epoch ms when the gate lets the next lookup through. */
	until: number;
}

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

// `gh` reports transport failures as prose on stderr. A resolver failure is
// wrapped by gh itself ("error connecting to <host> / check your internet
// connection", verified on gh 2.98); the rest are Go's net package phrasings
// that surface for refused, reset, and timed-out connections.
const UNREACHABLE_STDERR =
	/error connecting to|check your internet connection|no such host|dial tcp|i\/o timeout|connect timeout|tls handshake timeout|network is unreachable|connection refused|connection reset|getaddrinfo/i;

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

const HOLD_DESCRIPTION: Record<GitHubHoldReason, string> = {
	unreachable: "GitHub is unreachable from this host",
	"rate-limited": "GitHub API rate limit exceeded for this host's credential",
	auth: "GitHub rejected this host's credential",
};

export class GitHubUnavailableError extends Error {
	constructor(
		public readonly reason: GitHubHoldReason,
		public readonly retryAfterMs: number,
	) {
		super(
			`${HOLD_DESCRIPTION[reason]}; skipping the lookup for ${Math.ceil(retryAfterMs / 1000)}s`,
		);
		this.name = "GitHubUnavailableError";
	}
}

export function classifyGitHubHold(error: unknown): GitHubHoldReason | null {
	if (isGitHubUnreachableError(error)) return "unreachable";
	if (isGithubRateLimitError(error)) return "rate-limited";
	if (isGithubAuthError(error) || isGithubMissingAuthError(error))
		return "auth";
	return null;
}

export class GitHubAvailabilityGate {
	private streak = 0;
	private hold: GitHubAvailabilityStatus | null = null;
	private readonly now: () => number;

	constructor(options: { now?: () => number } = {}) {
		this.now = options.now ?? Date.now;
	}

	/** Milliseconds until the gate reopens; 0 when calls may proceed. */
	retryAfterMs(): number {
		return Math.max(0, (this.hold?.until ?? 0) - this.now());
	}

	/** The active hold, or null when calls may proceed. */
	status(): GitHubAvailabilityStatus | null {
		return this.hold && this.retryAfterMs() > 0 ? { ...this.hold } : null;
	}

	/** Throws while the gate is holding calls. */
	assertReachable(): void {
		const wait = this.retryAfterMs();
		if (wait > 0 && this.hold) {
			throw new GitHubUnavailableError(this.hold.reason, wait);
		}
	}

	/**
	 * Records a failed call. Returns null when the error means GitHub answered
	 * and the gate should stay out of it. Otherwise it returns the hold in
	 * force: `opened` is true only for the failure that opened it. Lookups run
	 * concurrently, so several can pass `assertReachable()` before the first
	 * one fails; the later failures belong to the same outage and must
	 * neither extend the hold nor log again, or one blip would run the
	 * backoff straight to its cap.
	 */
	recordFailure(
		error: unknown,
	): { reason: GitHubHoldReason; holdMs: number; opened: boolean } | null {
		const reason = classifyGitHubHold(error);
		if (!reason) return null;
		const now = this.now();
		if (this.hold && this.hold.until > now) {
			return {
				reason: this.hold.reason,
				holdMs: this.hold.until - now,
				opened: false,
			};
		}
		let holdMs: number;
		if (reason === "rate-limited") {
			const reset = parseRateLimitReset(error)?.getTime();
			holdMs =
				reset !== undefined && reset > now
					? Math.min(
							reset - now + RATE_LIMIT_RESET_SLACK_MS,
							RATE_LIMIT_MAX_HOLD_MS,
						)
					: RATE_LIMIT_DEFAULT_HOLD_MS;
		} else {
			this.streak += 1;
			holdMs = Math.min(BASE_BLOCK_MS * 2 ** (this.streak - 1), MAX_BLOCK_MS);
		}
		this.hold = { reason, since: now, until: now + holdMs };
		return { reason, holdMs, opened: true };
	}

	recordSuccess(): void {
		this.streak = 0;
		this.hold = null;
	}
}
