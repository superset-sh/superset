import { closeSync, fstatSync, openSync, readSync } from "node:fs";

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
 * The newest turns of a session file, joined, reading only as far back as it
 * takes to fill `maxChars`. Each widening reads just the bytes before the
 * last one, and a line the boundary cut waits for the next read to complete
 * it. Lines are split as bytes, so a boundary inside a multi-byte character
 * never decodes.
 *
 * One descriptor serves every read, so a file replaced mid-read cannot mix
 * two files. A read that fails or comes back short means the file changed
 * under it: the bytes would not join the line already carried, so widening
 * stops and keeps what the earlier reads found.
 */
export function readTurnsFromTail(
	path: string,
	maxChars: number,
	parseTurns: (raw: string) => string[],
): string | null {
	let fd: number;
	let size: number;
	try {
		fd = openSync(path, "r");
	} catch {
		return null;
	}
	try {
		size = fstatSync(fd).size;
		const batches: string[] = [];
		let chars = 0;
		let end = size;
		let window = INITIAL_TAIL_BYTES;
		let partialLine = Buffer.alloc(0);
		while (end > 0) {
			const start = Math.max(0, size - window);
			const chunk = Buffer.allocUnsafe(end - start);
			let read: number;
			try {
				read = readSync(fd, chunk, 0, chunk.length, start);
			} catch {
				break;
			}
			if (read < chunk.length) break;
			const bytes = Buffer.concat([chunk, partialLine]);
			let complete = bytes;
			if (start > 0) {
				const firstBreak = bytes.indexOf(0x0a);
				partialLine = firstBreak < 0 ? bytes : bytes.subarray(0, firstBreak);
				complete =
					firstBreak < 0 ? Buffer.alloc(0) : bytes.subarray(firstBreak + 1);
			}
			const older = parseTurns(complete.toString("utf8")).join("\n\n");
			if (older) {
				batches.unshift(older);
				chars += older.length;
			}
			end = start;
			if (chars >= maxChars || window >= MAX_TAIL_BYTES) break;
			window = Math.min(window * 4, MAX_TAIL_BYTES);
		}
		return batches.join("\n\n") || null;
	} catch {
		return null;
	} finally {
		try {
			closeSync(fd);
		} catch {
			// best effort
		}
	}
}
