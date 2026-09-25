import { closeSync, openSync, readSync, statSync } from "node:fs";

/**
 * First bite off the end of a session file. Tool results and screenshots make
 * up most of one, so a fixed tail can hold only a handful of turns of a
 * session whose whole conversation fits the budget; the read widens from here
 * until the budget is met or the file runs out.
 */
const INITIAL_TAIL_BYTES = 4 * 1024 * 1024;
/**
 * The read runs synchronously on the host's event loop, so it stops widening
 * here. Past it the oldest turns go unread rather than the host stalling for
 * seconds on a session of hundreds of megabytes.
 */
const MAX_TAIL_BYTES = 128 * 1024 * 1024;

/**
 * The last `maxBytes` of a file. A cut lands mid-line, and the parsers skip
 * lines they cannot parse, so the only casualty is the oldest turn.
 */
export function readFileTail(path: string, maxBytes: number): string | null {
	let fd: number | undefined;
	try {
		const { size } = statSync(path);
		const length = Math.min(size, maxBytes);
		const buffer = Buffer.allocUnsafe(length);
		fd = openSync(path, "r");
		// A short read would otherwise leave uninitialised heap in the tail,
		// which then gets decoded and shipped into another agent's prompt.
		const read = readSync(fd, buffer, 0, length, Math.max(0, size - length));
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

/**
 * The newest turns of a session file, joined, reading only as far back as it
 * takes to fill `maxChars`. A wider read that fails keeps the last good one.
 */
export function readTurnsFromTail(
	path: string,
	maxChars: number,
	parseTurns: (raw: string) => string[],
): string | null {
	let size: number;
	try {
		size = statSync(path).size;
	} catch {
		return null;
	}

	let window = INITIAL_TAIL_BYTES;
	let joined = "";
	while (true) {
		const raw = readFileTail(path, window);
		if (raw === null) break;
		joined = parseTurns(raw).join("\n\n");
		if (
			joined.length >= maxChars ||
			window >= size ||
			window >= MAX_TAIL_BYTES
		) {
			break;
		}
		window = Math.min(window * 4, MAX_TAIL_BYTES);
	}
	return joined || null;
}
