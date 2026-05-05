// Append-mode log fd for the daemon's stdio with size-based rotation.
// Mirrors the desktop's host-service log handling — when the bundle moves
// host-service into a headless deploy, daemon logs are still recoverable
// without an external log shipper.

import * as fs from "node:fs";
import * as path from "node:path";

export const MAX_DAEMON_LOG_BYTES = 5 * 1024 * 1024;

/**
 * Open an append-mode log fd, truncating first if it already exceeds
 * `maxBytes`. Returns -1 on failure so callers can fall back to ignoring
 * child stdio.
 */
export function openRotatingLogFd(logPath: string, maxBytes: number): number {
	try {
		fs.mkdirSync(path.dirname(logPath), { recursive: true, mode: 0o700 });
		if (fs.existsSync(logPath)) {
			try {
				const { size } = fs.statSync(logPath);
				if (size > maxBytes) {
					fs.writeFileSync(logPath, "", { mode: 0o600 });
				}
			} catch {
				// best-effort
			}
		}
		return fs.openSync(logPath, "a", 0o600);
	} catch {
		return -1;
	}
}
