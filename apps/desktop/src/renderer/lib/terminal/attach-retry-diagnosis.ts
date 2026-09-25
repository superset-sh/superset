/**
 * Consecutive connection-failure tracking for the terminal transport.
 *
 * partysocket's `retryCount` resets to 0 after 5s of socket uptime
 * (minUptime). Failure cycles that hold the WS open longer than that — a
 * wedged pty-daemon serving a successful upgrade then failing the attach
 * ~15s later, a host dying mid-attach, a proxy idle-timeout — never
 * accumulate there, so a diagnosis gated on retryCount alone never surfaces
 * for exactly the outages it should explain. The transport instead counts
 * every closed connection that never reached `attached`, and resets only on
 * a real attach.
 */
export interface AttachRetryState {
	consecutiveFailures: number;
	/**
	 * Server-reported reason from the latest attach-retryable rejection.
	 * Cleared when a connection fails some other way (dial failure, silent
	 * close), so it always reflects the CURRENT failure mode — a stale
	 * daemon-stall message must not override the probe classification once
	 * the outage has become a host/network one.
	 */
	lastMessage: string | null;
}

/**
 * How many consecutive failed attempts (failed dials via partysocket's
 * retryCount, or never-attached connections via this tracker) before the
 * header shows *why* the terminal is down. The socket keeps retrying forever
 * regardless; this only gates the user-facing diagnosis.
 */
export const DIAGNOSE_AFTER_ATTEMPTS = 10;

export function createAttachRetryState(): AttachRetryState {
	return { consecutiveFailures: 0, lastMessage: null };
}

/** A connection ended without ever delivering `attached`. */
export function recordFailedConnection(state: AttachRetryState): void {
	state.consecutiveFailures += 1;
}

export function noteAttachRetryableMessage(
	state: AttachRetryState,
	message: string,
): void {
	state.lastMessage = message;
}

export function clearAttachRetryableMessage(state: AttachRetryState): void {
	state.lastMessage = null;
}

export function resetAttachRetryState(state: AttachRetryState): void {
	state.consecutiveFailures = 0;
	state.lastMessage = null;
}

/** Whichever counter actually saw the outage drives the threshold. */
export function effectiveFailureCount(
	state: AttachRetryState,
	socketRetryCount: number,
): number {
	return Math.max(state.consecutiveFailures, socketRetryCount);
}

export function shouldSurfaceDiagnosis(
	state: AttachRetryState,
	socketRetryCount: number,
): boolean {
	return (
		effectiveFailureCount(state, socketRetryCount) >= DIAGNOSE_AFTER_ATTEMPTS
	);
}
