import { closeSync, openSync, readSync } from "node:fs";

/** Whether the first `maxBytes` of a file contain `needle`. */
export function fileHeadIncludes(
	path: string,
	needle: string,
	maxBytes: number,
): boolean {
	let fd: number | undefined;
	try {
		fd = openSync(path, "r");
		const buffer = Buffer.allocUnsafe(maxBytes);
		const read = readSync(fd, buffer, 0, maxBytes, 0);
		return buffer.subarray(0, read).includes(needle);
	} catch {
		return false;
	} finally {
		if (fd !== undefined) {
			try {
				closeSync(fd);
			} catch {
				// best effort
			}
		}
	}
}

/** The first `maxBytes` of a file as text, or null when it cannot be read. */
export function readFileHead(path: string, maxBytes: number): string | null {
	let fd: number | undefined;
	try {
		fd = openSync(path, "r");
		const buffer = Buffer.allocUnsafe(maxBytes);
		const read = readSync(fd, buffer, 0, maxBytes, 0);
		return buffer.subarray(0, Math.max(0, read)).toString("utf8");
	} catch {
		return null;
	} finally {
		if (fd !== undefined) {
			try {
				closeSync(fd);
			} catch {
				// best effort
			}
		}
	}
}
