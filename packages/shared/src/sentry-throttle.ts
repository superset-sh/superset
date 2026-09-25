/**
 * Client-side throttle for an error that repeats.
 *
 * Sentry's own Dedupe integration keeps a single previous event and drops only
 * an immediate repeat, so an interleaved retry loop walks straight past it: one
 * machine leaking file descriptors sent 97,800 copies of the same `spawn EBADF`
 * in a month with Dedupe enabled. A failure that repeats is worth knowing about
 * a few times an hour, not ten thousand; the events it crowds out are the rare
 * ones actually worth reading, and the quota it burns is what took the whole
 * organization's error reporting offline for four days.
 *
 * Keeps the first few events per fingerprint per window, drops the rest, and
 * reports how many were dropped on the next one through — a suppressed
 * firehose still has to read as a firehose, or throttling just hides the bug.
 */

/** The shape this needs from a Sentry event; structural so no SDK import. */
export interface ThrottleableEvent {
	/** Set on transactions and other non-error envelopes. */
	type?: string;
	message?: string;
	exception?: {
		values?: Array<{
			type?: string;
			value?: string;
			stacktrace?: {
				frames?: Array<{
					filename?: string;
					function?: string;
					lineno?: number;
				}>;
			};
		}>;
	};
	extra?: Record<string, unknown>;
}

export interface SentryThrottleOptions {
	/** Events allowed per fingerprint per window. */
	limit?: number;
	windowMs?: number;
	/** Ceiling on tracked fingerprints, so a unique-per-event message (a path,
	 * a pid) cannot grow this without bound. */
	maxFingerprints?: number;
	now?: () => number;
}

interface WindowState {
	start: number;
	sent: number;
	suppressed: number;
}

const DEFAULT_LIMIT = 3;
const DEFAULT_WINDOW_MS = 60 * 60_000;
const DEFAULT_MAX_FINGERPRINTS = 500;

/**
 * Returns a `beforeSend` that drops repeats of an error it has already
 * reported this window. Returns the event to send, or null to drop it.
 */
export function createSentryEventThrottle(
	options: SentryThrottleOptions = {},
): <T extends ThrottleableEvent>(event: T) => T | null {
	const limit = options.limit ?? DEFAULT_LIMIT;
	const windowMs = options.windowMs ?? DEFAULT_WINDOW_MS;
	const maxFingerprints = options.maxFingerprints ?? DEFAULT_MAX_FINGERPRINTS;
	const now = options.now ?? Date.now;
	// Insertion order is recency order: every touched key is re-inserted, so
	// the first entry is always the least recently seen.
	const windows = new Map<string, WindowState>();

	return <T extends ThrottleableEvent>(event: T): T | null => {
		// Transactions are not what floods, and they have their own sampling.
		if (event.type) return event;

		const key = fingerprintOf(event);
		const at = now();
		const state = windows.get(key);
		windows.delete(key);

		if (!state || at - state.start >= windowMs) {
			windows.set(key, { start: at, sent: 1, suppressed: 0 });
			evictBeyond(windows, maxFingerprints);
			const suppressed = state?.suppressed ?? 0;
			if (suppressed > 0) {
				event.extra = { ...event.extra, suppressed_since_last: suppressed };
			}
			return event;
		}

		if (state.sent < limit) {
			state.sent += 1;
			windows.set(key, state);
			return event;
		}

		state.suppressed += 1;
		windows.set(key, state);
		return null;
	};
}

function fingerprintOf(event: ThrottleableEvent): string {
	const exception = event.exception?.values?.[0];
	if (!exception) return `message:${event.message ?? ""}`;
	// Sentry orders frames oldest first, so the throwing frame is the last one.
	const frames = exception.stacktrace?.frames;
	const frame = frames?.[frames.length - 1];
	return [
		exception.type ?? "",
		exception.value ?? "",
		frame?.filename ?? "",
		frame?.function ?? "",
		frame?.lineno ?? "",
	].join("|");
}

function evictBeyond(
	windows: Map<string, WindowState>,
	maxFingerprints: number,
): void {
	while (windows.size > maxFingerprints) {
		const oldest = windows.keys().next();
		if (oldest.done) return;
		windows.delete(oldest.value);
	}
}
