/**
 * Reconnect Strategy
 *
 * Exponential backoff with jitter for SSH reconnection.
 * Delays: 1s, 2s, 4s, 8s, 16s, max 30s
 */

const BASE_DELAY_MS = 1000;
const MAX_DELAY_MS = 30_000;
const JITTER_FACTOR = 0.3;

export interface ReconnectStrategy {
	/** Get the delay for the next attempt (ms) */
	getDelay(attempt: number): number;
	/** Maximum number of reconnect attempts before giving up */
	maxAttempts: number;
}

function addJitter(delay: number): number {
	const jitter = delay * JITTER_FACTOR * (Math.random() * 2 - 1);
	return Math.max(0, Math.round(delay + jitter));
}

export const defaultReconnectStrategy: ReconnectStrategy = {
	maxAttempts: 10,

	getDelay(attempt: number): number {
		const exponential = BASE_DELAY_MS * 2 ** attempt;
		const capped = Math.min(exponential, MAX_DELAY_MS);
		return addJitter(capped);
	},
};

/**
 * Wait for the reconnect delay, respecting an abort signal.
 */
export function waitForReconnect(
	attempt: number,
	strategy: ReconnectStrategy = defaultReconnectStrategy,
	signal?: AbortSignal,
): Promise<void> {
	const delay = strategy.getDelay(attempt);
	return new Promise((resolve, reject) => {
		if (signal?.aborted) {
			reject(new Error("Reconnect aborted"));
			return;
		}

		const timer = setTimeout(resolve, delay);

		signal?.addEventListener(
			"abort",
			() => {
				clearTimeout(timer);
				reject(new Error("Reconnect aborted"));
			},
			{ once: true },
		);
	});
}
