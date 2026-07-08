import { authClient, setJwt } from "renderer/lib/auth-client";

/**
 * Bounded JWT refresh for Electric sync 401s.
 *
 * Every Electric shape/collection shares one `onError` handler; when the
 * session breaks, every shape 401s at once and — before this gate — each 401
 * fired its own `authClient.token()` (`POST /api/auth/token`) with no backoff,
 * dedup, or circuit breaker. Across a heavy multi-workspace client that storm
 * hit hundreds of requests and tripped Vercel's per-IP firewall, which then
 * denied the login endpoint too (self-lockout). See issue #5513.
 *
 * The gate collapses concurrent 401s into a single in-flight refresh, spaces
 * repeated refreshes with exponential backoff, and opens a circuit after
 * repeated failures so a permanently-broken session stops hammering the API.
 */

export const JWT_REFRESH_MIN_INTERVAL_MS = 3_000; // floor between refreshes
export const JWT_REFRESH_MAX_BACKOFF_MS = 60_000; // cap per-attempt backoff
export const JWT_REFRESH_MAX_FAILURES = 5; // then open the circuit
export const JWT_REFRESH_CIRCUIT_COOLDOWN_MS = 5 * 60_000; // circuit-open window

export interface JwtRefreshState {
	/** A refresh request is currently awaiting the network. */
	inFlight: boolean;
	/** Timestamp (ms) of the last refresh attempt. */
	lastAttemptAt: number;
	/** Consecutive failed refreshes (reset on success). */
	consecutiveFailures: number;
}

/**
 * Pure policy: given the gate state and current time, may we hit
 * `/api/auth/token` right now? Single-flight, exponential backoff, and a
 * circuit breaker after `JWT_REFRESH_MAX_FAILURES`.
 */
export function shouldAttemptJwtRefresh(
	state: JwtRefreshState,
	now: number,
): boolean {
	if (state.inFlight) {
		return false; // single-flight: collapse concurrent 401s into one call
	}
	const { consecutiveFailures: failures, lastAttemptAt } = state;
	if (failures >= JWT_REFRESH_MAX_FAILURES) {
		// Circuit open: only probe again once the cooldown has elapsed.
		return now - lastAttemptAt >= JWT_REFRESH_CIRCUIT_COOLDOWN_MS;
	}
	const backoff = Math.min(
		JWT_REFRESH_MIN_INTERVAL_MS * 2 ** failures,
		JWT_REFRESH_MAX_BACKOFF_MS,
	);
	return now - lastAttemptAt >= backoff;
}

/** Pure transition: fold a refresh result into the gate state. */
export function applyJwtRefreshResult(
	state: JwtRefreshState,
	succeeded: boolean,
): JwtRefreshState {
	return {
		inFlight: false,
		lastAttemptAt: state.lastAttemptAt,
		consecutiveFailures: succeeded ? 0 : state.consecutiveFailures + 1,
	};
}

let gate: JwtRefreshState = {
	inFlight: false,
	lastAttemptAt: 0,
	consecutiveFailures: 0,
};
let inFlightRefresh: Promise<void> | null = null;

/**
 * Refresh the Electric JWT after a 401, subject to the gate. Safe to call from
 * every shape's `onError` — concurrent calls dedupe to one network request and
 * a broken session backs off instead of storming `/api/auth/token`.
 *
 * Callers await the shared in-flight refresh so a shape only retries once the
 * new JWT has actually been set (not with the stale one). When the gate is
 * backed off or the circuit is open there's nothing to await — it resolves
 * immediately and the caller falls back to Electric's own retry backoff.
 */
export async function refreshJwtAfterUnauthorized(
	now: number = Date.now(),
): Promise<void> {
	if (inFlightRefresh) {
		return inFlightRefresh;
	}
	if (!shouldAttemptJwtRefresh(gate, now)) {
		return;
	}
	gate = { ...gate, inFlight: true, lastAttemptAt: now };
	inFlightRefresh = (async () => {
		let succeeded = false;
		try {
			const result = await authClient.token();
			if (result.data?.token) {
				setJwt(result.data.token);
				succeeded = true;
			}
		} catch (error) {
			console.error("[collections] JWT refresh after 401 failed", error);
		} finally {
			gate = applyJwtRefreshResult(gate, succeeded);
			inFlightRefresh = null;
		}
	})();
	return inFlightRefresh;
}
