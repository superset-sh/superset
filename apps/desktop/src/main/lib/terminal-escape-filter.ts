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
 * Pattern to detect clear scrollback sequences:
 * - ESC [ 3 J - Clear scrollback buffer (ED3)
 * - ESC c - Full terminal reset (RIS)
 */
const CLEAR_SCROLLBACK_PATTERN = new RegExp(`${ESC}\\[3J|${ESC}c`);

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
 * Only buffers sequences that look like query responses we want to filter.
 */
export class TerminalEscapeFilter {
	private buffer = "";

	/**
	 * Filter terminal query responses from data.
	 * Handles sequences that may be split across multiple data events.
	 */
	filter(data: string): string {
		// Combine buffered data with new data
		const combined = this.buffer + data;
		this.buffer = "";

		// Check if the data ends with a potential incomplete query response
		const lastEscIndex = combined.lastIndexOf(ESC);

		// Only consider buffering if ESC is very close to end (max 30 chars for reasonable sequence)
		// and the sequence looks like one of our target patterns
		if (lastEscIndex !== -1 && lastEscIndex > combined.length - 30) {
			const afterEsc = combined.slice(lastEscIndex);

			// Only buffer if it looks like an incomplete query response pattern
			if (
				this.looksLikeQueryResponse(afterEsc) &&
				this.isIncomplete(afterEsc)
			) {
				this.buffer = afterEsc;
				const toFilter = combined.slice(0, lastEscIndex);
				return toFilter.replace(COMBINED_PATTERN, "");
			}
		}

		// No incomplete query response, filter the whole thing
		return combined.replace(COMBINED_PATTERN, "");
	}

	/**
	 * Check if a string looks like the START of a query response we want to filter.
	 * Conservative but must handle chunked sequences: buffers potential query responses
	 * at chunk boundaries. If the complete sequence doesn't match our filter, it passes through.
	 */
	private looksLikeQueryResponse(str: string): boolean {
		if (str.length < 2) return false; // Just ESC alone - don't buffer, could be anything

		const secondChar = str[1];

		// CSI query responses we want to buffer:
		// - ESC [ ? (DA1, DECRPM private mode)
		// - ESC [ > (DA2 secondary)
		// - ESC [ digit (CPR, standard mode reports, device attributes)
		if (secondChar === "[") {
			if (str.length < 3) return false; // ESC [ alone - don't buffer
			const thirdChar = str[2];
			// Buffer ? (private mode) or > (secondary DA)
			if (thirdChar === "?" || thirdChar === ">") return true;
			// Buffer digit-starting CSI sequences that could be query responses:
			// - CPR: ESC[24;1R or ESC[1R
			// - Standard mode report: ESC[12;2$y
			// - Device attributes: ESC[0;276;0c
			// Color codes like ESC[32m will complete quickly and pass through
			// since they don't match our filter patterns.
			if (/\d/.test(thirdChar)) {
				return true;
			}
			return false;
		}

		// OSC color responses: ESC ] 1 (OSC 10-19)
		if (secondChar === "]") {
			if (str.length < 3) return false; // ESC ] alone - don't buffer
			// Only buffer if it starts with 1 (OSC 10-19 color responses)
			return str[2] === "1";
		}

		// DCS responses: ESC P > (XTVERSION) or ESC P ! (DA3)
		if (secondChar === "P") {
			if (str.length < 3) return false; // ESC P alone - don't buffer
			const thirdChar = str[2];
			return thirdChar === ">" || thirdChar === "!";
		}

		return false;
	}

	/**
	 * Check if a potential query response sequence is incomplete.
	 */
	private isIncomplete(str: string): boolean {
		if (str.length < 2) return true;

		const secondChar = str[1];

		// CSI sequence: ESC [
		if (secondChar === "[") {
			const csiBody = str.slice(2);
			if (csiBody.length === 0) return true;
			// CSI is complete once we encounter the first final byte (A–Z, a–z, or ~)
			// Scan from the start to avoid treating trailing text as part of the CSI
			const finalIndex = csiBody.search(/[A-Za-z~]/);
			return finalIndex === -1;
		}

		// OSC sequence: ESC ]
		if (secondChar === "]") {
			// OSC ends with BEL or ST (ESC \)
			return !str.includes(BEL) && !str.includes(`${ESC}\\`);
		}

		// DCS sequence: ESC P
		if (secondChar === "P") {
			// DCS ends with ST (ESC \)
			return !str.includes(`${ESC}\\`);
		}

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

/**
 * Checks if data contains sequences that clear the scrollback buffer.
 * Used to detect when the shell sends clear commands (e.g., from `clear` command or Ctrl+L).
 *
 * Detected sequences:
 * - ESC [ 3 J - Clear scrollback buffer (ED3)
 * - ESC c - Full terminal reset (RIS)
 */
export function containsClearScrollbackSequence(data: string): boolean {
	return CLEAR_SCROLLBACK_PATTERN.test(data);
}

const ED3_SEQUENCE = `${ESC}[3J`;
const RIS_SEQUENCE = `${ESC}c`;

/**
 * Extracts content after the last clear scrollback sequence.
 * When a clear sequence is detected, only the content AFTER the last
 * clear sequence should be persisted to scrollback/history.
 */
export function extractContentAfterClear(data: string): string {
	const ed3Index = data.lastIndexOf(ED3_SEQUENCE);
	const risIndex = data.lastIndexOf(RIS_SEQUENCE);

	const ed3End = ed3Index !== -1 ? ed3Index + ED3_SEQUENCE.length : -1;
	const risEnd = risIndex !== -1 ? risIndex + RIS_SEQUENCE.length : -1;

	const cutPoint = Math.max(ed3End, risEnd);

	if (cutPoint <= 0) {
		return data;
	}

	return data.slice(cutPoint);
}
