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
	 * OSC (Operating System Command) color responses
	 * Response format: ESC ] Ps ; rgb:rrrr/gggg/bbbb ST
	 * Where ST is BEL (\x07) or ESC \
	 *
	 * Common queries:
	 * - OSC 10: Foreground color
	 * - OSC 11: Background color
	 * - OSC 12: Cursor color
	 * - OSC 13-19: Various highlight colors
	 */
	oscColorResponse: `${ESC}\\]1[0-9];rgb:[0-9a-fA-F]{4}/[0-9a-fA-F]{4}/[0-9a-fA-F]{4}(?:${BEL}|${ESC}\\\\)`,

	/**
	 * XTVERSION response: ESC P > | text ESC \
	 * Response to XTVERSION query for terminal version
	 */
	xtversion: `${ESC}P>\\|[^${ESC}]*${ESC}\\\\`,
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
 * Filters out terminal query responses from PTY output.
 *
 * These responses are generated when xterm.js queries the terminal for:
 * - Cursor position
 * - Device attributes (terminal capabilities)
 * - Color settings
 * - Mode states
 *
 * The responses should be processed by xterm.js during live sessions but
 * should not be stored in scrollback as they appear as garbage text when
 * the terminal is reattached.
 *
 * @param data - Raw PTY output data
 * @returns Filtered data with query responses removed
 */
export function filterTerminalQueryResponses(data: string): string {
	return data.replace(COMBINED_PATTERN, "");
}

// Export patterns for testing
export const patterns = FILTER_PATTERNS;
