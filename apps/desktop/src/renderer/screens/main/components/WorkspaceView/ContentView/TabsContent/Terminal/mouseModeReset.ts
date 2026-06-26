/**
 * DEC private mode numbers that put the terminal into a mouse-reporting state.
 *
 * When any of these are enabled, xterm.js translates pointer movement and clicks
 * into escape sequences and writes them to the PTY as input. A foreground program
 * (vim, htop, a coding agent, …) normally enables these and consumes the events.
 */
const MOUSE_REPORTING_MODES = [
	9, // X10 compatibility
	1000, // Normal tracking (button press/release)
	1001, // Highlight tracking
	1002, // Button-event tracking (motion while pressed)
	1003, // Any-event tracking (all motion)
	1005, // UTF-8 extended coordinates
	1006, // SGR extended coordinates
	1015, // URXVT extended coordinates
	1016, // SGR-Pixels extended coordinates
] as const;

/**
 * DECRST sequence that disables every mouse-reporting mode at once.
 */
export const DISABLE_MOUSE_REPORTING_SEQUENCE = MOUSE_REPORTING_MODES.map(
	(mode) => `\x1b[?${mode}l`,
).join("");

/**
 * Append mouse-reporting reset sequences to restored ("cold restore") content.
 *
 * A serialized snapshot (via `@xterm/addon-serialize`) and the daemon's rehydrate
 * sequences both re-emit whatever mouse-tracking modes the previous foreground
 * program had enabled. On a cold restore (e.g. after a reboot) that program is no
 * longer running, so nothing consumes those events: xterm.js re-enables mouse
 * reporting and then writes pointer coordinates to the freshly-started shell,
 * which echoes them back as typed text. See issue #5358.
 *
 * Appending DECRST disables after the restored content guarantees the restored
 * terminal starts with mouse reporting off, regardless of what the snapshot
 * enabled. The sequences are invisible, so they do not alter the rendered
 * scrollback.
 */
export function withMouseReportingReset(content: string): string {
	return content + DISABLE_MOUSE_REPORTING_SEQUENCE;
}
