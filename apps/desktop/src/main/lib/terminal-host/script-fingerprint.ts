/**
 * Daemon script staleness detection.
 *
 * In development (`bun run dev`) the desktop app is rebuilt on every relaunch,
 * which re-emits `dist/main/terminal-host.js` and bumps its mtime — even when
 * the emitted bytes are byte-for-byte identical. The client used to detect a
 * "stale" daemon by comparing this mtime, so it killed the running daemon on
 * *every* restart, destroying every live PTY (long-running agents, dev servers)
 * and resetting workspace terminals to a bare shell prompt (issue #3611).
 *
 * These helpers fingerprint the daemon script by its *content* instead, so the
 * daemon is only considered stale when the script actually changed.
 */

import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";

/**
 * Compute a content-based fingerprint of the daemon script.
 *
 * Returns `null` when the script is missing or unreadable so callers can treat
 * "unknown" the same as "not stale" (never kill a daemon on a read error).
 */
export function computeScriptFingerprint(scriptPath: string): string | null {
	try {
		if (!existsSync(scriptPath)) {
			return null;
		}
		const contents = readFileSync(scriptPath);
		return createHash("sha256").update(contents).digest("hex");
	} catch {
		return null;
	}
}

/**
 * Decide whether the running daemon's script is stale relative to the script on
 * disk. Only reports stale when the fingerprints differ — an mtime bump with
 * unchanged content is NOT stale.
 *
 * @param savedFingerprint fingerprint recorded when the daemon was spawned, or
 *   `null`/empty when none was recorded (first run or manual cleanup)
 * @param scriptPath path to the daemon script on disk
 */
export function isScriptStale(
	savedFingerprint: string | null | undefined,
	scriptPath: string,
): boolean {
	if (!savedFingerprint) {
		return false; // No saved fingerprint = first run or manual cleanup.
	}
	const currentFingerprint = computeScriptFingerprint(scriptPath);
	if (currentFingerprint === null) {
		return false; // Can't read the script → don't restart the daemon.
	}
	return savedFingerprint !== currentFingerprint;
}
