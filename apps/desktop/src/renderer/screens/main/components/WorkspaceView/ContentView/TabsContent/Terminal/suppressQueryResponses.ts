import type { Terminal } from "@xterm/xterm";

/**
 * Keeps the renderer xterm silent on terminal query traffic.
 *
 * v1 architecture: the terminal-host daemon's HeadlessEmulator owns the
 * canonical reply to DA1/DA2/DSR terminal queries — it answers instantly,
 * straight into PTY stdin (see the `emulator.onData` hook in `session.ts`).
 * The renderer xterm sees the same PTY output and would auto-reply too; that
 * duplicate travels renderer → tRPC → `Session.write()` → PTY stdin
 * ~20-40ms later. `Session.write()` only drops escape input while the shell
 * is initializing, so after the first prompt the duplicate lands in whatever
 * program is reading stdin — go-survey CLIs (gh, vercel, spacectl) abort
 * with "unexpected escape sequence from terminal: ['\x1b' ']']" and stray
 * text like `^[[2;1R` leaks onto the prompt (#3499).
 *
 * Query-side suppression (handler matches the QUERY and returns `true`,
 * bypassing xterm's default action so no reply is ever generated):
 *
 * - DA1 (`CSI c`), DA2 (`CSI > c`), DSR (`CSI 5n`/`CSI 6n`, param-gated),
 *   DECXCPR (`CSI ? 6 n`, param-gated): the daemon emulator answers these.
 * - OSC 10/11/12 payloads where any `;`-slot is `?` (color queries):
 *   deliberately left UNANSWERED — an intentional capability reduction.
 *   Programs treat a missing reply as a capability gap (and the
 *   `TERM_THEME`/`COLORFGBG` env hints cover theme detection), whereas a
 *   renderer reply is exactly the late-stdin leak above. Set commands
 *   (color-spec slots, no `?`) fall through so themes still propagate.
 *   Mixed stacked payloads (`?;rgb:...`) are treated as queries: dropping
 *   their set-slots is preferred over leaking a reply.
 * - `CSI ? 996 n` (color-scheme query) is intentionally NOT suppressed:
 *   only the renderer can answer it (`CSI ?997;Pn n`), so suppression would
 *   delete the capability rather than dedupe it.
 *
 * Response-side handlers (predate this change, kept as-is): CPR (`CSI R`),
 * focus reports (`CSI I`/`CSI O`), ANSI mode report (`CSI $y`) are consumed
 * so replayed/echoed responses never render. Known pre-existing caveats,
 * out of scope here: the `I` matcher also swallows CHT (cursor forward
 * tabulation), and the no-prefix `$y` matcher does not match DEC-mode
 * reports (`CSI ? … $y`).
 *
 * @param terminal - The xterm.js Terminal instance
 * @returns Cleanup function to dispose all registered handlers
 */
export function suppressQueryResponses(terminal: Terminal): () => void {
	const disposables: { dispose: () => void }[] = [];
	const parser = terminal.parser;

	// --- Query-side: never auto-reply; the daemon emulator answers. ---

	// DA1 — Primary Device Attributes. Query: `CSI c` / `CSI 0c`.
	disposables.push(parser.registerCsiHandler({ final: "c" }, () => true));

	// DA2 — Secondary Device Attributes. Query: `CSI > c`.
	disposables.push(
		parser.registerCsiHandler({ prefix: ">", final: "c" }, () => true),
	);

	// DSR — Device Status Report. Gate on params 5 (status) / 6 (CPR); other
	// DSR params fall through untouched.
	disposables.push(
		parser.registerCsiHandler({ final: "n" }, (params) => {
			const code = params[0];
			return code === 5 || code === 6;
		}),
	);

	// DECXCPR — `CSI ? 6 n`. Gate on param 6 so `CSI ?996n` (color-scheme
	// query, renderer-answered) keeps working.
	disposables.push(
		parser.registerCsiHandler(
			{ prefix: "?", final: "n" },
			(params) => params[0] === 6,
		),
	);

	// OSC 10/11/12 — fg/bg/cursor color. Suppress query payloads (any slot
	// `?`); set commands fall through to the default handler.
	for (const code of [10, 11, 12]) {
		disposables.push(
			parser.registerOscHandler(code, (data) =>
				data.split(";").some((slot) => slot === "?"),
			),
		);
	}

	// --- Response-side (pre-existing): consume response-shaped sequences so
	// they never render as text. See header for known caveats.

	// CPR — Cursor Position Report response: `CSI Pr;Pc R`.
	disposables.push(parser.registerCsiHandler({ final: "R" }, () => true));

	// Focus reports (mode 1004): `CSI I` in, `CSI O` out.
	disposables.push(parser.registerCsiHandler({ final: "I" }, () => true));
	disposables.push(parser.registerCsiHandler({ final: "O" }, () => true));

	// ANSI mode report: `CSI Ps;Pm $y`.
	disposables.push(
		parser.registerCsiHandler({ intermediates: "$", final: "y" }, () => true),
	);

	return () => {
		for (const disposable of disposables) {
			disposable.dispose();
		}
	};
}
