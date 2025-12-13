/**
 * Parse OSC 7 escape sequences to extract the current working directory.
 * OSC 7 format: ESC]7;file://hostname/path BEL (or ESC\)
 *
 * This is emitted by shells when the directory changes.
 */

const ESC = "\x1b";
const BEL = "\x07";

// Match OSC 7 sequences: ESC]7;file://hostname/path followed by BEL or ST (ESC\)
const OSC7_PATTERN = new RegExp(
	`${ESC}\\]7;file://[^/]*((?:/[^${BEL}${ESC}]*)*)(?:${BEL}|${ESC}\\\\)`,
	"g",
);

/**
 * Parse terminal output data for OSC 7 directory sequences.
 * Returns the last (most recent) directory found, or null if none.
 */
export function parseCwd(data: string): string | null {
	let lastMatch: string | null = null;

	for (const match of data.matchAll(OSC7_PATTERN)) {
		const path = match[1];
		if (path) {
			try {
				lastMatch = decodeURIComponent(path);
			} catch {
				lastMatch = path;
			}
		}
	}

	return lastMatch;
}
