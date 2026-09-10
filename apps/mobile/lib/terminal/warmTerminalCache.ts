/**
 * Paintable snapshots of the terminals this app showed recently, each paired
 * with the stream position it reflects.
 *
 * A workspace screen takes its WebView with it when it is popped, so coming
 * back to a terminal meant a new WebView, a fresh dial and a full replay —
 * seconds of black screen on the switches a phone does all day. A cached
 * buffer is painted before the socket exists, and the position lets the host
 * send only what arrived while we were away (`?seq=` in host-service's
 * terminal.ts — the same contract desktop's renderer uses through
 * terminal-seq-anchor.ts).
 *
 * Memory only, deliberately: a snapshot is worth nothing after a relaunch
 * (the host's catch-up ring does not outlive one either), and scrollback is
 * whatever the agent printed — not something to leave on disk.
 */

export interface WarmTerminalSnapshot {
	/** Serialized xterm buffer, written verbatim into a fresh terminal. */
	data: string;
	/**
	 * Stream identity and position `data` reflects. Null epoch means the
	 * position is unknown, which downgrades the next attach to a reanchor
	 * rather than risking a gap.
	 */
	epoch: string | null;
	seq: number;
}

/**
 * Enough for the handful of workspaces someone actually cycles between; the
 * cost of a wider cache is held buffers, and the benefit stops once the cycle
 * fits.
 */
const CAPACITY = 5;

/**
 * Nothing is held open, so age costs only memory and a moment of stale
 * content before the catch-up lands — which is why this is minutes rather
 * than the seconds a live-connection pool would have to use.
 */
const MAX_AGE_MS = 10 * 60_000;

interface Entry {
	snapshot: WarmTerminalSnapshot;
	at: number;
}

/** Insertion order is the recency order both accessors maintain. */
const entries = new Map<string, Entry>();

function dropExpired(now: number): void {
	for (const [terminalId, entry] of entries) {
		if (now - entry.at > MAX_AGE_MS) entries.delete(terminalId);
	}
}

export function rememberWarmTerminal(
	terminalId: string,
	snapshot: WarmTerminalSnapshot,
): void {
	const now = Date.now();
	dropExpired(now);
	entries.delete(terminalId);
	entries.set(terminalId, { snapshot, at: now });
	while (entries.size > CAPACITY) {
		const oldest = entries.keys().next();
		if (oldest.done) break;
		entries.delete(oldest.value);
	}
}

/**
 * Left in place rather than consumed: a page that dies without handing back a
 * fresh snapshot should still get the old one, and an anchor that has fallen
 * behind costs a longer catch-up, never a gap.
 */
export function readWarmTerminal(
	terminalId: string,
): WarmTerminalSnapshot | null {
	const now = Date.now();
	dropExpired(now);
	const entry = entries.get(terminalId);
	if (!entry) return null;
	entries.delete(terminalId);
	entries.set(terminalId, { snapshot: entry.snapshot, at: now });
	return entry.snapshot;
}

/** Sign-out: these buffers belong to the account that just left. */
export function clearWarmTerminals(): void {
	entries.clear();
}
