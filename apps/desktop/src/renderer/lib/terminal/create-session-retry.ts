/**
 * Transient "Failed to fetch" failures hit the terminal-create path when the
 * local host-service is momentarily unreachable — busy under load, mid-restart,
 * or the dynamic loopback port just rotated. The renderer surfaces these as a
 * hard `Failed to run preset` / `Failed to fetch (127.0.0.1:<port>)` toast even
 * though the request never reached host-service, so nothing was actually run
 * (#5699).
 *
 * `terminal.createSession` is idempotent on host-service (existing in-memory
 * session → no-op; adopt a surviving daemon PTY; otherwise spawn), so retrying
 * a connection-level failure is safe and recovers the common case where the
 * service comes back within a beat.
 */

/**
 * Connection-level fetch failures never reach the server, so retrying them is
 * safe. In the renderer a rejected `fetch` surfaces as a `TypeError` with a
 * message like `Failed to fetch` / `Load failed`; tRPC wraps that, keeping the
 * original as `cause`. Server-side errors (validation, INTERNAL_SERVER_ERROR)
 * carry a real HTTP response and must NOT be retried here.
 */
export function isTransientNetworkError(error: unknown): boolean {
	const messages: string[] = [];
	let current: unknown = error;
	// Walk the cause chain — tRPC/superjson wrap the original fetch TypeError.
	for (let depth = 0; current instanceof Error && depth < 5; depth++) {
		messages.push(current.message);
		current = current.cause;
	}
	if (typeof error === "string") messages.push(error);
	return /failed to fetch|load failed|network\s?error|econnrefused|econnreset|and the network connection was lost/i.test(
		messages.join(" "),
	);
}

export interface NetworkRetryOptions {
	/** Total attempts, including the first. Defaults to 3. */
	attempts?: number;
	/** Base delay between attempts, scaled linearly by attempt. Defaults to 200ms. */
	delayMs?: number;
	/** Injectable for tests. */
	sleep?: (ms: number) => Promise<void>;
}

const defaultSleep = (ms: number) =>
	new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Runs `operation`, retrying only on transient network failures with a short
 * linear backoff. Non-network errors (and the final attempt) rethrow
 * immediately.
 */
export async function withNetworkRetry<T>(
	operation: () => Promise<T>,
	options: NetworkRetryOptions = {},
): Promise<T> {
	const attempts = Math.max(1, options.attempts ?? 3);
	const delayMs = options.delayMs ?? 200;
	const sleep = options.sleep ?? defaultSleep;

	let lastError: unknown;
	for (let attempt = 0; attempt < attempts; attempt++) {
		try {
			return await operation();
		} catch (error) {
			lastError = error;
			const isLastAttempt = attempt === attempts - 1;
			if (isLastAttempt || !isTransientNetworkError(error)) throw error;
			await sleep(delayMs * (attempt + 1));
		}
	}
	throw lastError;
}
