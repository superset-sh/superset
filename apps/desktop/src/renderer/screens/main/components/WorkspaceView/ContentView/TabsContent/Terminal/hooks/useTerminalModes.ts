import { useCallback, useRef } from "react";

export interface UseTerminalModesReturn {
	/** Whether terminal is currently in alternate screen mode (e.g., vim, less) */
	isAlternateScreenRef: React.MutableRefObject<boolean>;
	/** Whether bracketed paste mode is enabled */
	isBracketedPasteRef: React.MutableRefObject<boolean>;
	/** Buffer for scanning mode escape sequences across chunk boundaries */
	modeScanBufferRef: React.MutableRefObject<string>;
	/** Update mode flags from terminal data */
	updateModesFromData: (data: string) => void;
	/** Reset all mode flags to initial state */
	resetModes: () => void;
}

/**
 * Hook to track terminal mode states (alternate screen, bracketed paste).
 *
 * Tracks mode toggles by scanning terminal data for escape sequences.
 * Uses a carry buffer to handle sequences split across stream frames.
 *
 * Alternate screen mode:
 * - Enter: \x1b[?1049h or \x1b[?47h
 * - Exit: \x1b[?1049l or \x1b[?47l
 *
 * Bracketed paste mode:
 * - Enable: \x1b[?2004h
 * - Disable: \x1b[?2004l
 */
export function useTerminalModes(): UseTerminalModesReturn {
	// Track alternate screen mode ourselves (xterm.buffer.active.type is unreliable after HMR/recovery)
	// Updated from: snapshot.modes.alternateScreen on restore, escape sequences in stream
	const isAlternateScreenRef = useRef(false);
	// Track bracketed paste mode so large pastes can preserve a single bracketed-paste envelope.
	const isBracketedPasteRef = useRef(false);
	// Track mode toggles across chunk boundaries (escape sequences can span stream frames).
	const modeScanBufferRef = useRef("");

	const updateModesFromData = useCallback((data: string) => {
		// Escape sequences can be split across streamed frames, so scan using a small carry buffer.
		const combined = modeScanBufferRef.current + data;

		const enterAltIndex = Math.max(
			combined.lastIndexOf("\x1b[?1049h"),
			combined.lastIndexOf("\x1b[?47h"),
		);
		const exitAltIndex = Math.max(
			combined.lastIndexOf("\x1b[?1049l"),
			combined.lastIndexOf("\x1b[?47l"),
		);
		if (enterAltIndex !== -1 || exitAltIndex !== -1) {
			isAlternateScreenRef.current = enterAltIndex > exitAltIndex;
		}

		const enableBracketedIndex = combined.lastIndexOf("\x1b[?2004h");
		const disableBracketedIndex = combined.lastIndexOf("\x1b[?2004l");
		if (enableBracketedIndex !== -1 || disableBracketedIndex !== -1) {
			isBracketedPasteRef.current =
				enableBracketedIndex > disableBracketedIndex;
		}

		// Keep a small tail in case the next chunk starts mid-sequence.
		modeScanBufferRef.current = combined.slice(-32);
	}, []);

	const resetModes = useCallback(() => {
		isAlternateScreenRef.current = false;
		isBracketedPasteRef.current = false;
		modeScanBufferRef.current = "";
	}, []);

	return {
		isAlternateScreenRef,
		isBracketedPasteRef,
		modeScanBufferRef,
		updateModesFromData,
		resetModes,
	};
}
