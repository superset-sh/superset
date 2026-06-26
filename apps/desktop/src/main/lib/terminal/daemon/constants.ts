export const SESSION_CLEANUP_DELAY_MS = 5000;
export const DEBUG_TERMINAL = process.env.SUPERSET_TERMINAL_DEBUG === "1";
export const CREATE_OR_ATTACH_CONCURRENCY = 3;
export const MAX_SCROLLBACK_BYTES = 500_000;
export const MAX_HISTORY_SCROLLBACK_BYTES = 512 * 1024;
export const MAX_KILLED_SESSION_TOMBSTONES = 1000;

// Disable sequences for interactive input modes that can leak across a cold
// restore. When a TUI (vim, less, htop, etc.) crashes or is killed without a
// chance to clean up, the scrollback on disk still contains the mode-enable
// escape sequences (e.g. `\x1b[?1000h`) but no balancing disable. Replaying
// that scrollback into xterm re-activates mouse tracking / focus reporting,
// and subsequent mouse movement is echoed as escape sequences ("random
// numbers") in the terminal. We append this reset to cold-restored scrollback
// so the restored terminal lands in a clean input mode state.
export const COLD_RESTORE_INPUT_MODE_RESET = [
	"\x1b[?9l", // X10 mouse tracking
	"\x1b[?1000l", // Normal mouse tracking (button press/release)
	"\x1b[?1001l", // Highlight mouse tracking
	"\x1b[?1002l", // Button-event mouse tracking (drag)
	"\x1b[?1003l", // Any-event mouse tracking (motion)
	"\x1b[?1004l", // Focus reporting
	"\x1b[?1005l", // UTF-8 mouse encoding
	"\x1b[?1006l", // SGR mouse encoding
	"\x1b[?1015l", // urxvt mouse encoding
].join("");
