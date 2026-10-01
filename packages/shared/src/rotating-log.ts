import * as fs from "node:fs";
import path from "node:path";

/** Rotate per-org host-service.log once it exceeds this size. */
export const MAX_HOST_LOG_BYTES = 5 * 1024 * 1024;

/**
 * Move `logPath` to `logPath.1` once it exceeds maxBytes, replacing the older
 * `.1`, so a rotation keeps the history just before it.
 */
export function rotateLogIfOversized(logPath: string, maxBytes: number): void {
	try {
		if (fs.statSync(logPath).size > maxBytes) {
			fs.renameSync(logPath, `${logPath}.1`);
		}
	} catch {
		// Best-effort rotate
	}
}

/**
 * Open an append-mode log fd, rotating it first if it exceeds maxBytes.
 * Returns -1 on failure so callers can fall back to ignoring child stdio.
 */
export function openRotatingLogFd(logPath: string, maxBytes: number): number {
	try {
		fs.mkdirSync(path.dirname(logPath), { recursive: true, mode: 0o700 });
		rotateLogIfOversized(logPath, maxBytes);
		const fd = fs.openSync(logPath, "a", 0o600);
		// openSync's mode arg only applies on create — normalize an existing
		// file's perms in case it was rotated out-of-band with laxer bits.
		try {
			fs.chmodSync(logPath, 0o600);
		} catch (error) {
			console.warn(
				`[host-service] Failed to chmod log file ${logPath}: ${error}`,
			);
		}
		return fd;
	} catch (error) {
		console.warn(`[host-service] Failed to open log file ${logPath}: ${error}`);
		return -1;
	}
}
