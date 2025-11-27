/**
 * Filters terminal escape sequence responses from PTY output.
 *
 * When xterm.js initializes or queries terminal capabilities, the terminal
 * responds with escape sequences. These responses should not be stored in
 * scrollback as they display as garbage when replayed on reattach.
 */

// Control characters
const ESC = "\x1b";
const BEL = "\x07";

/**
 * Pattern definitions for terminal query responses.
 * Each pattern matches a specific type of response that should be filtered.
 */
const FILTER_PATTERNS = {
	/**
	 * Cursor Position Report (CPR): ESC [ Pl ; Pc R or ESC [ Pl R
	 * Response to DSR (Device Status Report) query ESC [ 6 n
	 * Examples:
	 * - ESC[24;1R (cursor at row 24, column 1)
	 * - ESC[2R (cursor at row 2, column defaults to 1)
	 */
	cursorPositionReport: `${ESC}\\[\\d+(?:;\\d+)?R`,

	/**
	 * Primary Device Attributes (DA1): ESC [ ? Ps c
	 * Response to DA1 query ESC [ c or ESC [ 0 c
	 * Example: ESC[?1;0c (VT100 with no options)
	 */
	primaryDeviceAttributes: `${ESC}\\[\\?[\\d;]*c`,

	/**
	 * Secondary Device Attributes (DA2): ESC [ > Ps c
	 * Response to DA2 query ESC [ > c or ESC [ > 0 c
	 * Example: ESC[>0;276;0c (xterm version 276)
	 */
	secondaryDeviceAttributes: `${ESC}\\[>[\\d;]*c`,

	/**
	 * Device Attributes without prefix: ESC [ Ps c
	 * Some terminals respond without ? or > prefix
	 * Example: ESC[0;276;0c
	 */
	deviceAttributesNoPrefix: `${ESC}\\[[\\d;]+c`,

	/**
	 * Tertiary Device Attributes (DA3): ESC P ! | ... ESC \
	 * Response to DA3 query, returns unit ID
	 */
	tertiaryDeviceAttributes: `${ESC}P![|][^${ESC}]*${ESC}\\\\`,

	/**
	 * DEC Private Mode Report (DECRPM): ESC [ ? Ps ; Pm $ y
	 * Response to DECRQM query for private mode status
	 * Example: ESC[?1;2$y (mode 1 is set)
	 */
	decPrivateModeReport: `${ESC}\\[\\?\\d+;\\d+\\$y`,

	/**
	 * Standard Mode Report: ESC [ Ps ; Pm $ y
	 * Response to DECRQM query for standard (non-private) mode status
	 * Example: ESC[12;2$y (mode 12 status)
	 */
	standardModeReport: `${ESC}\\[\\d+;\\d+\\$y`,

	/**
	 * OSC (Operating System Command) color responses
	 * Response format: ESC ] Ps ; rgb:rr/gg/bb ST or ESC ] Ps ; rgb:rrrr/gggg/bbbb ST
	 * Where ST is BEL (\x07) or ESC \
	 * Hex values can be 2-4 digits per channel depending on terminal
	 *
	 * Common queries:
	 * - OSC 10: Foreground color
	 * - OSC 11: Background color
	 * - OSC 12: Cursor color
	 * - OSC 13-19: Various highlight colors
	 */
	oscColorResponse: `${ESC}\\]1[0-9];rgb:[0-9a-fA-F]{2,4}/[0-9a-fA-F]{2,4}/[0-9a-fA-F]{2,4}(?:${BEL}|${ESC}\\\\)`,

	/**
	 * XTVERSION response: ESC P > | text ESC \
	 * Response to XTVERSION query for terminal version
	 */
	xtversion: `${ESC}P>\\|[^${ESC}]*${ESC}\\\\`,

	/**
	 * ESC [ O - Unknown/malformed sequence that appears in some terminals
	 */
	unknownCSI_O: `${ESC}\\[O`,
} as const;

/**
 * Combined regex pattern for all terminal query responses.
 * Patterns are joined with | (OR) to match any of them.
 */
const COMBINED_PATTERN = new RegExp(
	Object.values(FILTER_PATTERNS).join("|"),
	"g",
);

/**
 * Stateful filter that handles escape sequences split across data chunks.
 * Maintains a buffer to reassemble split sequences before filtering.
 */
export class TerminalEscapeFilter {
	private buffer = "";
	private readonly maxBufferSize = 256; // Max bytes to buffer

	/**
	 * Filter terminal query responses from data.
	 * Handles sequences that may be split across multiple data events.
	 */
	filter(data: string): string {
		// Combine buffered data with new data
		const combined = this.buffer + data;
		this.buffer = "";

		// Check if the data ends with a potential incomplete escape sequence
		const lastEscIndex = combined.lastIndexOf(ESC);

		if (lastEscIndex !== -1 && lastEscIndex > combined.length - 50) {
			// There's an ESC near the end - it might be incomplete
			const afterEsc = combined.slice(lastEscIndex);

			// Check if this looks like a complete sequence or clearly incomplete
			if (this.isIncompleteSequence(afterEsc)) {
				// Buffer the incomplete part for next chunk
				this.buffer = afterEsc;
				const toFilter = combined.slice(0, lastEscIndex);
				return toFilter.replace(COMBINED_PATTERN, "");
			}
		}

		// No incomplete sequence, filter the whole thing
		return combined.replace(COMBINED_PATTERN, "");
	}

	/**
	 * Check if a string starting with ESC looks like an incomplete escape sequence.
	 */
	private isIncompleteSequence(str: string): boolean {
		if (str.length < 2) return true; // Just ESC alone

		const secondChar = str[1];

		// CSI sequence: ESC [
		if (secondChar === "[") {
			// CSI sequences end with a letter (typically)
			// If we don't see a terminating letter, it's incomplete
			// Complete CSI sequences typically end with: c, R, y, n, m, etc.
			const csiBody = str.slice(2);
			if (csiBody.length === 0) return true;
			// Check if it ends with a CSI terminator
			const lastChar = csiBody[csiBody.length - 1];
			if (/[a-zA-Z~]/.test(lastChar)) return false; // Looks complete
			return true; // Still building
		}

		// OSC sequence: ESC ]
		if (secondChar === "]") {
			// OSC sequences end with BEL or ST (ESC \)
			if (str.includes(BEL)) return false;
			if (str.includes(ESC + "\\")) return false;
			return true; // Still building
		}

		// DCS sequence: ESC P
		if (secondChar === "P") {
			// DCS sequences end with ST (ESC \)
			if (str.includes(ESC + "\\")) return false;
			return true;
		}

		// Other single-char sequences are complete
		return false;
	}

	/**
	 * Flush any remaining buffered data.
	 * Call this when the terminal session ends.
	 */
	flush(): string {
		const remaining = this.buffer;
		this.buffer = "";
		return remaining.replace(COMBINED_PATTERN, "");
	}

	/**
	 * Reset the filter state.
	 */
	reset(): void {
		this.buffer = "";
	}
}

/**
 * Filters out terminal query responses from PTY output.
 * Stateless version - does not handle chunked sequences.
 *
 * @param data - Raw PTY output data
 * @returns Filtered data with query responses removed
 * @deprecated Use TerminalEscapeFilter class for proper chunked handling
 */
export function filterTerminalQueryResponses(data: string): string {
	return data.replace(COMBINED_PATTERN, "");
}

// Export patterns for testing
export const patterns = FILTER_PATTERNS;
