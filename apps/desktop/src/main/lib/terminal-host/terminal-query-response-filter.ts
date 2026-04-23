/**
 * Filter xterm query-response sequences from data flowing renderer → PTY.
 *
 * The headless emulator (see headless-emulator.ts) answers terminal queries
 * (DA, DSR, OSC 10/11, XTVERSION, ...) and forwards the reply to the PTY
 * directly. When a renderer xterm is attached, it also replies to the same
 * queries and sends the reply over the WebSocket as if it were user input.
 * If we forward those duplicates, the shell reads them as typed text.
 *
 * Symptom: after quitting nvim, the next shell prompt shows a literal
 * `^[[?62;4;9;22c` or similar. nvim issues DA/DSR queries on startup; the
 * shell consumes the headless reply, the renderer's duplicate reply arrives
 * slightly later and lands on the shell prompt instead. See #3685.
 */

const QUERY_RESPONSE_REGEX = new RegExp(
	[
		// Primary Device Attributes (DA1) reply: ESC [ ? <params> c
		String.raw`\x1b\[\?[0-9;]*c`,
		// Secondary Device Attributes (DA2) reply: ESC [ > <params> c
		String.raw`\x1b\[>[0-9;]*c`,
		// Tertiary Device Attributes (DA3) short-form reply: ESC [ = <params> c
		String.raw`\x1b\[=[0-9;]*c`,
		// Device Status Report replies: ESC [ <digit> n  (e.g. 0n, 3n)
		String.raw`\x1b\[[0-9]n`,
		// Cursor Position Report (DSR 6 reply): ESC [ <row> ; <col> R
		String.raw`\x1b\[[0-9]+;[0-9]+R`,
		// OSC 10/11 foreground/background color replies, BEL- or ST-terminated
		String.raw`\x1b\]1[01];[^\x07\x1b]*(?:\x07|\x1b\\)`,
		// DCS replies (XTVERSION, DA3 long form): ESC P [>!] | ... ESC \
		String.raw`\x1bP[!>]\|[^\x1b]*\x1b\\`,
	].join("|"),
	"g",
);

export function stripTerminalQueryResponses(data: string): string {
	if (!data.includes("\x1b")) return data;
	return data.replace(QUERY_RESPONSE_REGEX, "");
}
