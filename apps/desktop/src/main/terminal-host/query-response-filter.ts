/**
 * Filter for terminal capability responses written to the PTY.
 *
 * When a foreground process queries the terminal (DA1, DSR, OSC 10/11/12
 * etc.), our headless emulator on the main process answers directly. The
 * renderer's xterm answers the same queries independently, and forwards
 * its replies through the renderer→main `terminal.write` path.
 *
 * If both replies reach the PTY, the foreground process consumes one and
 * the duplicate sits in the slave's input buffer. After the foreground
 * exits, the next reader (the shell) consumes it as if typed — surfacing
 * as stray text like `?62;4;9;22c` or `11;rgb:1515/1111/1010` at the
 * prompt. See issues #4013, #4041.
 *
 * This module strips renderer-originated query responses so only the
 * headless emulator's reply reaches the PTY.
 */

const ESC = "\x1b";
const BEL = "\x07";

// Regexes are constructed from strings so the source files don't carry
// raw control characters (Biome's noControlCharactersInRegex rule).
const QUERY_RESPONSE_PATTERNS: RegExp[] = [
	// DA1 response: ESC[?Pn;...c (private prefix `?` distinguishes it from
	// the DA1 query `ESC[c` and from user input ending in `c`).
	new RegExp(`${ESC}\\[\\?[0-9;]+c`, "g"),
	// DA2 response: ESC[>Pn;...c
	new RegExp(`${ESC}\\[>[0-9;]+c`, "g"),
	// DA3 response: ESC[=Pn;...c (rare but emitted by some terminals)
	new RegExp(`${ESC}\\[=[0-9;]+c`, "g"),
	// Cursor Position Report (DSR-CPR): ESC[<row>;<col>R
	new RegExp(`${ESC}\\[[0-9]+;[0-9]+R`, "g"),
	// Device Status Report ok: ESC[0n
	new RegExp(`${ESC}\\[0n`, "g"),
	// OSC 10/11/12 color responses: ESC]1[012];rgb:RR/GG/BB ST
	// Terminator is BEL (\x07) or ESC\ (string terminator).
	new RegExp(
		`${ESC}\\]1[012];rgb:[0-9a-fA-F]+/[0-9a-fA-F]+/[0-9a-fA-F]+(?:${BEL}|${ESC}\\\\)`,
		"g",
	),
];

/**
 * Remove all terminal capability response sequences from `data`.
 * Returns the input unchanged when no response patterns are present.
 */
export function stripTerminalQueryResponses(data: string): string {
	if (!data.includes(ESC)) return data;
	let out = data;
	for (const pattern of QUERY_RESPONSE_PATTERNS) {
		out = out.replace(pattern, "");
	}
	return out;
}
