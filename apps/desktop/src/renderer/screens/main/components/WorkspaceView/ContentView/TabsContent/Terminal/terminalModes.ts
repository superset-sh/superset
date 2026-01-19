/**
 * Terminal mode parsing utilities.
 * Extracts terminal mode states (alternate screen, bracketed paste) from escape sequences.
 */

const ESC = "\x1b";

/**
 * Escape sequences for alternate screen mode.
 * - \x1b[?1049h / \x1b[?1049l: xterm alternate screen (with save/restore cursor)
 * - \x1b[?47h / \x1b[?47l: older alternate screen (without cursor save/restore)
 */
const ALT_SCREEN_ENTER_SEQUENCES = [`${ESC}[?1049h`, `${ESC}[?47h`] as const;
const ALT_SCREEN_EXIT_SEQUENCES = [`${ESC}[?1049l`, `${ESC}[?47l`] as const;

/**
 * Escape sequences for bracketed paste mode.
 * - \x1b[?2004h: enable bracketed paste
 * - \x1b[?2004l: disable bracketed paste
 */
const BRACKETED_PASTE_ENABLE = `${ESC}[?2004h`;
const BRACKETED_PASTE_DISABLE = `${ESC}[?2004l`;

export interface TerminalModes {
	alternateScreen: boolean;
	bracketedPaste: boolean;
}

/**
 * Parse terminal modes from escape sequence data.
 * Uses lastIndexOf to find the final state after multiple enter/exit cycles.
 *
 * @param data - Terminal output data containing escape sequences
 * @param previousModes - Previous mode state (for incremental parsing)
 * @returns Updated terminal modes
 */
export function parseModesFromData(
	data: string,
	previousModes: TerminalModes = {
		alternateScreen: false,
		bracketedPaste: false,
	},
): TerminalModes {
	const modes = { ...previousModes };

	// Find the last occurrence of each alternate screen sequence
	const enterAltIndex = Math.max(
		data.lastIndexOf(ALT_SCREEN_ENTER_SEQUENCES[0]),
		data.lastIndexOf(ALT_SCREEN_ENTER_SEQUENCES[1]),
	);
	const exitAltIndex = Math.max(
		data.lastIndexOf(ALT_SCREEN_EXIT_SEQUENCES[0]),
		data.lastIndexOf(ALT_SCREEN_EXIT_SEQUENCES[1]),
	);

	if (enterAltIndex !== -1 || exitAltIndex !== -1) {
		modes.alternateScreen = enterAltIndex > exitAltIndex;
	}

	// Find the last occurrence of bracketed paste sequences
	const enableBracketedIndex = data.lastIndexOf(BRACKETED_PASTE_ENABLE);
	const disableBracketedIndex = data.lastIndexOf(BRACKETED_PASTE_DISABLE);

	if (enableBracketedIndex !== -1 || disableBracketedIndex !== -1) {
		modes.bracketedPaste = enableBracketedIndex > disableBracketedIndex;
	}

	return modes;
}

/**
 * Parse terminal modes with a carry buffer to handle escape sequences split across chunks.
 * Returns the updated modes and a new buffer to use for the next chunk.
 *
 * @param data - Current chunk of terminal data
 * @param carryBuffer - Buffer from previous chunk (may contain partial escape sequence)
 * @param previousModes - Previous mode state
 * @returns Object with updated modes and new carry buffer
 */
export function parseModesWithCarryBuffer(
	data: string,
	carryBuffer: string,
	previousModes: TerminalModes,
): { modes: TerminalModes; newCarryBuffer: string } {
	// Combine carry buffer with new data to handle sequences split across chunks
	const combined = carryBuffer + data;

	const modes = parseModesFromData(combined, previousModes);

	// Keep a small tail in case the next chunk starts mid-sequence
	// (longest sequence is 8 chars: \x1b[?1049h)
	const newCarryBuffer = combined.slice(-32);

	return { modes, newCarryBuffer };
}
