/**
 * Bounded retry for transient database connection failures.
 *
 * The neon-http driver (`neon()`) issues one HTTP request per query and does
 * not retry. A brief Neon/Postgres blip (compute suspend/restart, momentary
 * connection-layer unavailability) therefore surfaces immediately as a
 * user-facing 500 across every subsystem that happens to query in that window.
 *
 * This wraps the driver's `fetch` with a small number of retries on transient
 * network / 5xx conditions using capped exponential backoff with jitter. Only
 * idempotent-at-the-HTTP-layer failures (network errors, connect timeouts,
 * 502/503/504, and Neon's 429 rate limit) are retried; application-level SQL
 * errors return a normal HTTP 200 from the neon proxy and are never retried
 * here, so query semantics are unchanged.
 */

const DEFAULT_MAX_RETRIES = 3;
const BASE_DELAY_MS = 50;
const MAX_DELAY_MS = 500;

// HTTP statuses from the neon proxy that indicate a transient upstream issue
// rather than a deterministic SQL error (which comes back as 200 + error body).
const RETRYABLE_STATUS = new Set([429, 502, 503, 504]);

function isRetryableNetworkError(error: unknown): boolean {
	if (!(error instanceof Error)) return false;
	// fetch throws a TypeError ("fetch failed" / "network error") on connection
	// reset/refused/DNS failures, and an AbortError on connect timeout.
	const name = error.name;
	if (name === "AbortError" || name === "TimeoutError") return true;
	if (name === "TypeError") return true;
	const cause = (error as { cause?: { code?: string } }).cause;
	const code = cause?.code;
	return (
		code === "ECONNRESET" ||
		code === "ECONNREFUSED" ||
		code === "ETIMEDOUT" ||
		code === "EPIPE" ||
		code === "ENOTFOUND" ||
		code === "EAI_AGAIN"
	);
}

function backoffDelayMs(attempt: number): number {
	const exp = Math.min(MAX_DELAY_MS, BASE_DELAY_MS * 2 ** attempt);
	// Full jitter to avoid a synchronized retry stampede across pods.
	return Math.floor(Math.random() * exp);
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * A `fetch`-compatible function that retries transient failures before giving
 * up. Suitable to pass as neon's `fetchFunction` option.
 */
export function createRetryingFetch(
	maxRetries: number = DEFAULT_MAX_RETRIES,
	underlyingFetch: typeof fetch = fetch,
): typeof fetch {
	return async function retryingFetch(input, init) {
		let lastError: unknown;
		for (let attempt = 0; attempt <= maxRetries; attempt++) {
			try {
				const response = await underlyingFetch(input, init);
				if (attempt < maxRetries && RETRYABLE_STATUS.has(response.status)) {
					lastError = new Error(`transient upstream status ${response.status}`);
					await sleep(backoffDelayMs(attempt));
					continue;
				}
				return response;
			} catch (error) {
				lastError = error;
				if (attempt >= maxRetries || !isRetryableNetworkError(error)) {
					throw error;
				}
				await sleep(backoffDelayMs(attempt));
			}
		}
		throw lastError;
	} as typeof fetch;
}
