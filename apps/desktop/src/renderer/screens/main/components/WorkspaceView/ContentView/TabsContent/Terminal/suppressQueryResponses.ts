import type { Terminal } from "@xterm/xterm";

/**
 * Registers parser hooks to suppress terminal query responses from being
 * generated or rendered by the renderer xterm.
 *
 * In superset's split architecture the daemon owns a HeadlessEmulator that
 * answers terminal queries (DA, DSR, OSC 10/11/12, etc.) and writes the
 * response back into the PTY. That is the canonical reply.
 *
 * The renderer xterm receives the same PTY output and would also auto-reply
 * via `terminal.onData` -> WebSocket -> daemon `write()` -> PTY stdin. Once
 * the shell-ready guard in `session.ts` releases (escape filter only fires
 * during `pending`), those duplicate responses pass through and get echoed by
 * the kernel PTY driver as visible text at the next interactive prompt
 * (e.g. an interactive CLI's `Enter value:` prompt showing
 * `^[[?62;4;9;22c^[]11;rgb:0c0c/0e0e/1414^[\\`).
 *
 * Two suppression strategies, picked per-sequence:
 *
 * 1. **Suppress at the query side** — register a handler matching the QUERY's
 *    final byte and return `true`. Xterm's default handler is bypassed and no
 *    `onData` reply is generated, so nothing reaches the PTY. Safe because
 *    the headless emulator still answers. Used for DA1, DA2, OSC 10/11/12.
 *
 * 2. **Suppress at the response side** — register a handler matching the
 *    RESPONSE's distinguishing bytes. Used when query and response share a
 *    final byte but a different prefix/intermediate distinguishes them (CPR,
 *    focus reports, mode reports). Prevents echoed responses from rendering
 *    as visible text without affecting query interpretation.
 *
 * @param terminal - The xterm.js Terminal instance
 * @returns Cleanup function to dispose all registered handlers
 */
export function suppressQueryResponses(terminal: Terminal): () => void {
	const disposables: { dispose: () => void }[] = [];
	const parser = terminal.parser;

	// CSI Ps c — Primary Device Attributes (DA1) query.
	// Query: `ESC[c` or `ESC[0c`. Response: `ESC[?62;...c` (handled by daemon's
	// headless emulator). Suppressing the query stops the renderer from
	// generating a duplicate response that would echo at the next prompt.
	disposables.push(parser.registerCsiHandler({ final: "c" }, () => true));

	// CSI > Ps c — Secondary Device Attributes (DA2) query. Same rationale.
	disposables.push(
		parser.registerCsiHandler({ prefix: ">", final: "c" }, () => true),
	);

	// CSI sequences ending in 'R' — Cursor Position Report (response only).
	// Query is `ESC[6n` (final 'n'); response final byte 'R' is unique to the
	// reply, so suppressing renders no visible text if a stray response echoes.
	disposables.push(parser.registerCsiHandler({ final: "R" }, () => true));

	// CSI sequences ending in 'I' / 'O' — focus in/out reports (mode 1004).
	// No matching query; emitted by the terminal on focus changes.
	disposables.push(parser.registerCsiHandler({ final: "I" }, () => true));
	disposables.push(parser.registerCsiHandler({ final: "O" }, () => true));

	// CSI ? Ps ; Pm $ y — DECRPM mode report (response only).
	// Query is `ESC[?Ps$p` (final 'p'); response final '$y' is unique.
	disposables.push(
		parser.registerCsiHandler({ intermediates: "$", final: "y" }, () => true),
	);

	// OSC 10/11/12 — fg/bg/cursor color queries vs. set commands.
	// Query payload: `?` (e.g. `ESC]11;?BEL`). Set payload: a color spec
	// (`#rrggbb`, `rgb:rr/gg/bb`, named color, etc.). Suppress only when the
	// payload is a query so set commands continue to update theme colors.
	const suppressColorQuery = (data: string): boolean => data.startsWith("?");
	disposables.push(parser.registerOscHandler(10, suppressColorQuery));
	disposables.push(parser.registerOscHandler(11, suppressColorQuery));
	disposables.push(parser.registerOscHandler(12, suppressColorQuery));

	return () => {
		for (const disposable of disposables) {
			disposable.dispose();
		}
	};
}
