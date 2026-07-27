export const HOST_SERVICE_RESPAWN_BASE_DELAY_MS = 1_000;
export const HOST_SERVICE_RESPAWN_MAX_DELAY_MS = 30_000;
/**
 * Eight attempts spans roughly 1.5 to 2 minutes (1s, 2s, 4s, 8s, 16s, then the
 * 30s cap). Sized for a crash whose cause outlives the crash: host-service dies
 * with the database or Docker, and a budget measured in seconds would be spent
 * before the dependency is back, leaving the user stuck exactly as they are
 * today.
 */
export const HOST_SERVICE_RESPAWN_MAX_ATTEMPTS = 8;
/**
 * Uptime that marks a respawn as having stuck, after which the attempt budget
 * resets. Without it an app left open for days would spend its five attempts on
 * unrelated crashes weeks apart and then stop healing.
 */
export const HOST_SERVICE_RESPAWN_STABLE_MS = 60_000;

/**
 * Delay (ms) before the next host-service respawn attempt, or `null` once the
 * budget is spent so the caller surfaces the crash instead of retrying forever.
 *
 * Same shape as `nextRecoveryDelayMs` in the renderer's session recovery:
 * exponential from the base delay, capped, with symmetric jitter. The cap keeps
 * a host-service that dies on startup from spinning, and the jitter matters
 * because several organizations can crash together (a shared cause such as the
 * database going away) and would otherwise respawn in lockstep. `random` is
 * injectable so tests are deterministic.
 */
export function nextRespawnDelayMs(
	attemptsMade: number,
	random: number = Math.random(),
): number | null {
	if (attemptsMade >= HOST_SERVICE_RESPAWN_MAX_ATTEMPTS) {
		return null;
	}
	// Clamp to >=1 so attemptsMade === 0 yields the attempt-1 band rather than a
	// sub-floor value from a negative exponent.
	const step = Math.max(1, attemptsMade);
	const backoff = Math.min(
		HOST_SERVICE_RESPAWN_BASE_DELAY_MS * 2 ** (step - 1),
		HOST_SERVICE_RESPAWN_MAX_DELAY_MS,
	);
	return Math.min(backoff * (0.5 + random), HOST_SERVICE_RESPAWN_MAX_DELAY_MS);
}
