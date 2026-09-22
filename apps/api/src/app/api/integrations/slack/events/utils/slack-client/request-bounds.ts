export const SLACK_REQUEST_TIMEOUT_MS = 15_000;
const MIN_REQUEST_TIMEOUT_MS = 1_000;
const RETRIES = 2;
export const RETRY_BACKOFF = { minTimeout: 200, maxTimeout: 1_000 };
const RETRY_BUDGET_MS =
	SLACK_REQUEST_TIMEOUT_MS * (RETRIES + 1) + RETRY_BACKOFF.maxTimeout * RETRIES;

export interface SlackRequestBounds {
	timeout: number;
	retries: number;
}

/**
 * A healthy Slack call finishes in well under 15s, so the cap only exists to
 * turn a stalled connection into an error. With a run deadline, the cap and
 * the retry count shrink so no call, retries included, outlives the budget.
 */
export function slackRequestBounds(
	deadline: number | undefined,
	now = Date.now(),
): SlackRequestBounds {
	const remaining =
		deadline === undefined ? Number.POSITIVE_INFINITY : deadline - now;
	const timeout = Math.max(
		MIN_REQUEST_TIMEOUT_MS,
		Math.min(SLACK_REQUEST_TIMEOUT_MS, remaining),
	);
	const retries = remaining >= RETRY_BUDGET_MS ? RETRIES : 0;
	return { timeout, retries };
}

export class SlackDeadlineExceededError extends Error {
	constructor() {
		super("Slack request started after the run deadline");
		this.name = "SlackDeadlineExceededError";
	}
}

/**
 * Runs before every attempt, retries included, so the timeout tracks the
 * budget as it drains and nothing starts once it is gone.
 */
export function deadlineRequestInterceptor(deadline: number, now = Date.now) {
	return <T extends { timeout?: number }>(config: T): T => {
		const remaining = deadline - now();
		if (remaining <= 0) throw new SlackDeadlineExceededError();
		return {
			...config,
			timeout: Math.min(SLACK_REQUEST_TIMEOUT_MS, remaining),
		};
	};
}

const RATE_LIMITED_CODE = "slack_webapi_rate_limited_error";

/** The wait Slack asked for, when `error` is the SDK's rejected 429. */
export function slackRateLimitRetryAfterMs(error: unknown): number | undefined {
	const candidate = error as { code?: string; retryAfter?: number } | null;
	return candidate?.code === RATE_LIMITED_CODE &&
		typeof candidate.retryAfter === "number"
		? candidate.retryAfter * 1000
		: undefined;
}
