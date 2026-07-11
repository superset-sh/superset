/**
 * Stale input-reporting terminal mode handling (#5508).
 *
 * TUIs arm DECSET modes (mouse tracking, focus reporting, bracketed paste)
 * and the kitty keyboard protocol, then disarm them on clean exit. A TUI that
 * dies uncleanly never writes its restore sequences, so replaying the
 * session's raw output log re-arms those modes in a renderer xterm that is
 * about to host a plain shell — which then receives mouse reports and CSI-u
 * key encodings as typed input. The replayed log also contains the TUI's
 * terminal queries (DA1, DSR, kitty query, size reports, OSC color/clipboard
 * queries); xterm answers them during replay and the responses are forwarded
 * to the fresh PTY as if the user typed them.
 *
 * This module is shared between the main process (which sanitizes replayed
 * scrollback before serving it for cold restore) and the renderer (which
 * disarms a reused xterm before attaching a fresh shell to it).
 */

const ESC = "\x1b";

/**
 * DECSET/DECRST private mode numbers that make the terminal send input
 * (mouse/focus reports) or re-encode keystrokes (cursor keys, bracketed
 * paste). Display modes (alt screen 1049/47, cursor visibility 25,
 * auto-wrap 7) are deliberately absent — replay must keep those to render
 * the restored screen correctly.
 */
export const INPUT_REPORTING_DECSET_PARAMS: ReadonlySet<number> = new Set([
	1, // DECCKM — application cursor keys
	9, // X10 mouse tracking
	1000, // normal mouse tracking
	1001, // highlight mouse tracking
	1002, // button-event mouse tracking
	1003, // any-event mouse tracking
	1004, // focus reporting
	1005, // UTF-8 mouse encoding
	1006, // SGR mouse encoding
	1007, // alternate scroll (wheel sends arrow keys)
	1015, // urxvt mouse encoding
	1016, // SGR-pixels mouse encoding
	2004, // bracketed paste
	2031, // color-scheme update reports (unsolicited CSI ?997;{1|2}n on theme change)
]);

/**
 * DECSET modes cleared when a live shell reclaims the foreground from a TUI
 * (see the OSC 777 prompt-marker handling in headless-emulator.ts): the
 * report generators (mouse protocols, focus, color-scheme updates) plus the
 * terminal-behavior modes that corrupt typing at a prompt when a dead TUI
 * leaks them (origin mode, reverse-wraparound; insert mode is the ANSI
 * counterpart below).
 *
 * Deliberately exempt:
 * - 1 (DECCKM) and 2004 (bracketed paste): zsh/bash/fish arm those for their
 *   own line editor, sometimes before emitting the prompt marker, so clearing
 *   them on the marker could drop a *live* shell's own state on the next warm
 *   reattach. They cause no junk at a shell prompt.
 * - 66 (application keypad): shells arm it themselves via smkx (ESC =) each
 *   time the line editor activates — same reasoning as DECCKM.
 * - The mouse encodings (1005/1006/1015/1016) and alternate scroll (1007):
 *   inert while no protocol is armed, and clearing them breaks suspend/fg —
 *   ^Z leaves the encoding physically armed in the renderer, the TUI on fg
 *   re-arms only its protocol, and SerializeAddon never serializes encodings,
 *   so a reclaimed encoding would rehydrate X10 under an SGR-expecting TUI.
 */
export const FOREGROUND_RECLAIM_RESET_PARAMS: ReadonlySet<number> = new Set([
	6, // DECOM — origin mode
	9, // X10 mouse tracking
	45, // reverse wraparound
	1000, // normal mouse tracking
	1001, // highlight mouse tracking
	1002, // button-event mouse tracking
	1003, // any-event mouse tracking
	1004, // focus reporting
	2031, // color-scheme update reports
]);

/**
 * ANSI (non-DECSET) modes cleared on foreground reclaim. IRM makes typing at
 * a prompt insert instead of overwrite — SerializeAddon re-emits it
 * (`CSI 4 h`) on every snapshot, so a dead TUI's leak would otherwise
 * survive every warm reattach.
 */
export const FOREGROUND_RECLAIM_RESET_ANSI_PARAMS: ReadonlySet<number> =
	new Set([4]);

// Byte-range helpers for the CSI grammar (ECMA-48).
const isParamByte = (code: number) => code >= 0x30 && code <= 0x3f; // 0-9 : ; < = > ?
const isIntermediateByte = (code: number) => code >= 0x20 && code <= 0x2f;
const isFinalByte = (code: number) => code >= 0x40 && code <= 0x7e;

interface EscSpan {
	/** Index to resume scanning from (past the sequence, or at an aborting ESC). */
	end: number;
	/** Text to emit for this sequence: the original bytes, a rewrite, or "". */
	emit: string;
}

/**
 * Decide the fate of a fully-parsed CSI sequence. Returns the original text to
 * keep it, a rewritten sequence to keep only its display-relevant params, or
 * "" to drop it. Everything dropped here is either an input-arming mode or a
 * query this renderer's xterm answers on the onData channel.
 */
function classifyCsi(
	seq: string,
	prefix: string,
	params: string,
	intermediates: string,
	final: string,
): string {
	// DECRQM (answered with a $y mode report) — the only intermediate-bearing
	// form that is stripped.
	if (
		final === "p" &&
		intermediates === "$" &&
		(prefix === "" || prefix === "?")
	) {
		return "";
	}
	// Any other sequence carrying intermediates matches none of the forms
	// below — xterm dispatches on prefix+intermediates+final together, so e.g.
	// `CSI ?1049;1002$h` is a no-op. Rewriting it by prefix+final alone would
	// manufacture an active `CSI ?1049h` that never executed. Keep verbatim.
	if (intermediates !== "") return seq;
	// DECSET/DECRST — drop input-reporting params, keep display ones. Handles
	// colon sub-parameters (e.g. 1000:1006) by keying on the primary param.
	if (prefix === "?" && (final === "h" || final === "l")) {
		const groups = params.split(";");
		const kept = groups.filter((group) => {
			const primary = Number.parseInt(group.split(":")[0] ?? "", 10);
			return !INPUT_REPORTING_DECSET_PARAMS.has(primary);
		});
		if (kept.length === groups.length) return seq;
		if (kept.length === 0) return "";
		return `${ESC}[?${kept.join(";")}${final}`;
	}
	// Kitty keyboard: set (=), push (>), pop (<), and query (?). Bare `CSI u`
	// is SCO restore-cursor — keep it.
	if (
		final === "u" &&
		(prefix === "<" || prefix === "=" || prefix === ">" || prefix === "?")
	) {
		return "";
	}
	// DA1 query (CSI c / CSI 0 c). A DA1 *response* is CSI ? … c (prefix "?")
	// and is display-inert — keep it so restored scrollback is untouched.
	if (final === "c" && prefix === "") return "";
	// DA2 / DA3 query.
	if (final === "c" && (prefix === ">" || prefix === "=")) return "";
	// DSR / DECXCPR (answered with cursor position / status).
	if (final === "n" && (prefix === "" || prefix === "?")) return "";
	// XTVERSION (CSI > q). DECSCUSR is CSI SP q — different prefix, kept.
	if (final === "q" && prefix === ">") return "";
	// XTWINOPS (CSI Ps t): window size/position reports (answered) plus one-way
	// window/title-stack ops (22/23t). None render glyphs, so dropping the lot
	// from replay is safe — and in a crash the matching restore was never
	// written anyway.
	if (final === "t" && prefix === "") return "";
	// XTSMGRAPHICS query (CSI ? … S). Scroll-up (SU) is CSI Ps S with no prefix
	// and is a display sequence — keep it.
	if (final === "S" && prefix === "?") return "";
	return seq;
}

function readCsi(data: string, start: number): EscSpan {
	// start points at the ESC of "ESC [".
	const n = data.length;
	let i = start + 2;
	let prefix = "";
	let params = "";
	let intermediates = "";
	// C0 controls embedded in a CSI are executed by xterm while the sequence
	// keeps collecting (CAN/SUB cancel it, ESC aborts it, DEL is ignored).
	// Re-emit them ahead of whatever the sequence resolves to so replay
	// preserves their effect without breaking the reassembled sequence.
	let executed = "";
	while (i < n) {
		const ch = data[i];
		const code = data.charCodeAt(i);
		if (code === 0x18 || code === 0x1a) {
			// CAN/SUB cancel the sequence; xterm returns to ground.
			return { end: i + 1, emit: executed };
		}
		if (ch === ESC) {
			// An ESC aborts the CSI and begins a new sequence — re-examine it.
			return { end: i, emit: executed };
		}
		if (code === 0x7f) {
			i++;
			continue;
		}
		if (code < 0x20) {
			executed += ch;
			i++;
			continue;
		}
		if (prefix === "" && params === "" && intermediates === "" && "<=>?".includes(ch)) {
			prefix = ch;
			i++;
			continue;
		}
		if (intermediates === "" && isParamByte(code)) {
			params += ch;
			i++;
			continue;
		}
		if (isIntermediateByte(code)) {
			intermediates += ch;
			i++;
			continue;
		}
		if (isFinalByte(code)) {
			const seq = `${ESC}[${prefix}${params}${intermediates}${ch}`;
			return {
				end: i + 1,
				emit:
					executed + classifyCsi(seq, prefix, params, intermediates, ch),
			};
		}
		// A byte that fits nowhere in the CSI grammar (e.g. a stray C1).
		// Drop the partial like xterm's ignore state and re-examine the byte.
		return { end: i, emit: executed };
	}
	return { end: n, emit: executed }; // incomplete at EOF — drop the partial
}

interface StringSeq {
	end: number;
	body: string;
	raw: string;
	aborted: boolean;
	/**
	 * True when the sequence ended on a bare ESC: the terminator belongs to the
	 * *following* sequence, so `raw` carries no terminator of its own. A kept
	 * sequence must then be re-terminated with ST — if the following sequence
	 * is stripped, emitting `raw` as-is would leave an open OSC/DCS that
	 * swallows everything after it as string payload.
	 */
	needsSt: boolean;
}

/**
 * Read a string-terminated sequence (OSC/DCS/SOS/PM/APC) from its introducer
 * to a BEL or ST terminator. An ESC that does not begin ST aborts it (xterm
 * discards the partial and restarts), signalled via `aborted`.
 */
function readStringSeq(
	data: string,
	start: number,
	introLen: number,
): StringSeq {
	const n = data.length;
	let i = start + introLen;
	while (i < n) {
		const ch = data[i];
		const code = data.charCodeAt(i);
		// CAN (0x18) / SUB (0x1a) abort the string in xterm, returning it to
		// ground state so following bytes render as text. Discard the partial
		// and resume just after the control so that text isn't over-stripped.
		if (code === 0x18 || code === 0x1a) {
			return { end: i + 1, body: "", raw: "", aborted: true, needsSt: false };
		}
		if (ch === "\x07") {
			return {
				end: i + 1,
				body: data.slice(start + introLen, i),
				raw: data.slice(start, i + 1),
				aborted: false,
				needsSt: false,
			};
		}
		if (ch === ESC) {
			if (data[i + 1] === "\\") {
				return {
					end: i + 2,
					body: data.slice(start + introLen, i),
					raw: data.slice(start, i + 2),
					aborted: false,
					needsSt: false,
				};
			}
			// A bare ESC ends the string with success in this xterm build (only
			// CAN/SUB abort) — it dispatches the sequence, then starts a new one.
			// Terminate here (keeping the un-terminated body for classification)
			// and resume at the ESC so the following sequence is scanned.
			return {
				end: i,
				body: data.slice(start + introLen, i),
				raw: data.slice(start, i),
				aborted: false,
				needsSt: true,
			};
		}
		i++;
	}
	// incomplete at EOF
	return { end: n, body: "", raw: "", aborted: true, needsSt: false };
}

/** Emit a kept string sequence, re-terminating it if it ended on a bare ESC. */
function keepStringSeq(s: StringSeq): string {
	return s.needsSt ? `${s.raw}${ESC}\\` : s.raw;
}

/**
 * Decide the fate of an OSC. Clipboard (52) is dropped whole. The color
 * OSCs (4, 10-12) are answered per entry: `?` entries are queries this
 * renderer's xterm would answer into the fresh PTY, while spec entries are
 * display state — keep the sets, strip only the queries (mirroring xterm's
 * own pair/slot walk). Everything else passes through.
 */
function classifyOsc(s: StringSeq): string {
	// OSC 52 clipboard: the query form is answered with the user's clipboard
	// contents, the set form clobbers their clipboard — drop both.
	if (s.body.startsWith("52;")) return "";
	const colorMatch = /^(4|1[0-2]);([\s\S]*)$/.exec(s.body);
	if (!colorMatch) return keepStringSeq(s);
	const ident = Number.parseInt(colorMatch[1], 10);
	const entries = colorMatch[2].split(";");
	const terminator = s.raw.endsWith("\x07") ? "\x07" : `${ESC}\\`;
	if (ident === 4) {
		// OSC 4 payload is idx;spec pairs; xterm answers `?` specs and applies
		// the rest. A dangling final entry with no spec is inert in xterm; drop
		// it if it looks like a query attempt, otherwise leave the sequence be.
		const kept: string[] = [];
		let dropped = false;
		let i = 0;
		for (; i + 1 < entries.length; i += 2) {
			if (entries[i + 1] === "?") dropped = true;
			else kept.push(entries[i], entries[i + 1]);
		}
		if (i < entries.length && entries[i].includes("?")) dropped = true;
		if (!dropped) return keepStringSeq(s);
		if (kept.length === 0) return "";
		return `${ESC}]4;${kept.join(";")}${terminator}`;
	}
	// OSC 10-12 advance positionally: `10;fg;bg` sets fg then bg. A kept set
	// must be re-addressed to the slot it would have landed on, or stripping
	// the query ahead of it would shift it onto the wrong color.
	const kept: Array<{ colorIdent: number; value: string }> = [];
	let dropped = false;
	entries.forEach((value, index) => {
		if (value === "?") dropped = true;
		else kept.push({ colorIdent: ident + index, value });
	});
	if (!dropped) return keepStringSeq(s);
	return kept
		.map(({ colorIdent, value }) => `${ESC}]${colorIdent};${value}${terminator}`)
		.join("");
}

function readEscSequence(data: string, start: number): EscSpan {
	const n = data.length;
	const next = data[start + 1];
	if (next === undefined) return { end: n, emit: "" }; // lone trailing ESC
	if (next === "[") return readCsi(data, start);
	if (next === "]") {
		const s = readStringSeq(data, start, 2);
		if (s.aborted) return { end: s.end, emit: "" };
		return { end: s.end, emit: classifyOsc(s) };
	}
	if (next === "P") {
		const s = readStringSeq(data, start, 2);
		if (s.aborted) return { end: s.end, emit: "" };
		// DECRQSS (DCS [Ps] $q … ST) is answered; other DCS (e.g. sixel) is
		// kept. xterm dispatches on the $q intermediate+final regardless of
		// params, so a param'd request must not slip past the match.
		if (/^[0-9:;]*\$q/.test(s.body)) return { end: s.end, emit: "" };
		return { end: s.end, emit: keepStringSeq(s) };
	}
	if (next === "X" || next === "^" || next === "_") {
		// SOS / PM / APC — never stripped, but consumed to their terminator so
		// their payload is not re-scanned as nested sequences.
		const s = readStringSeq(data, start, 2);
		if (s.aborted) return { end: s.end, emit: "" };
		return { end: s.end, emit: keepStringSeq(s) };
	}
	// Keypad application / numeric mode (input-affecting) — drop.
	if (next === "=" || next === ">") return { end: start + 2, emit: "" };
	// Any other ESC sequence: ESC, zero+ intermediates (0x20-0x2f), one final.
	let i = start + 1;
	while (i < n && isIntermediateByte(data.charCodeAt(i))) i++;
	if (i >= n) return { end: n, emit: "" };
	const finalCode = data.charCodeAt(i);
	if (finalCode < 0x30 || finalCode > 0x7e) return { end: i, emit: "" };
	return { end: i + 1, emit: data.slice(start, i + 1) };
}

/**
 * Normalize single-byte C1 introducers to their two-byte ESC equivalents so
 * one ESC-anchored scan covers both encodings — xterm honors either, so a
 * program can emit U+009B for CSI or U+009D for OSC to smuggle a sequence past
 * an ESC-only filter.
 */
function normalizeC1(data: string): string {
	let result = "";
	let runStart = 0;
	for (let i = 0; i < data.length; i++) {
		const code = data.charCodeAt(i);
		let expansion: string | null = null;
		if (code === 0x90)
			expansion = `${ESC}P`; // DCS
		else if (code === 0x98)
			expansion = `${ESC}X`; // SOS
		else if (code === 0x9b)
			expansion = `${ESC}[`; // CSI
		else if (code === 0x9c)
			expansion = `${ESC}\\`; // ST
		else if (code === 0x9d)
			expansion = `${ESC}]`; // OSC
		else if (code === 0x9e)
			expansion = `${ESC}^`; // PM
		else if (code === 0x9f) expansion = `${ESC}_`; // APC
		if (expansion !== null) {
			result += data.slice(runStart, i) + expansion;
			runStart = i + 1;
		}
	}
	return runStart === 0 ? data : result + data.slice(runStart);
}

/**
 * Strip input-mode arming and query sequences from a raw PTY output log
 * before it is replayed into a live xterm for cold restore. Display
 * sequences (text, colours, cursor movement, alt screen, titles, OSC-7 cwd,
 * hyperlinks, sixel) pass through untouched.
 *
 * A single left-to-right VT scan: it isolates each escape sequence, keeps or
 * drops it by type, and treats incomplete/aborted sequences the way xterm
 * does (discard). Being single-pass, it is linear in the input and cannot be
 * defeated by nesting fragments to reassemble an arming sequence across
 * deletions.
 */
export function sanitizeColdRestoreScrollback(raw: string): string {
	const data = normalizeC1(raw);
	const out: string[] = [];
	let i = 0;
	const n = data.length;
	while (i < n) {
		const esc = data.indexOf(ESC, i);
		if (esc === -1) {
			out.push(data.slice(i));
			break;
		}
		if (esc > i) out.push(data.slice(i, esc));
		const seq = readEscSequence(data, esc);
		if (seq.emit) out.push(seq.emit);
		i = seq.end;
	}
	return out.join("");
}

/**
 * Disarms every input-reporting mode a dead TUI can leave latched in an
 * xterm: DECRST for each tracked mode, numeric keypad, and a kitty keyboard
 * stack unwind (popping more entries than the stack holds empties it and
 * zeroes the flags; the explicit set-to-0 covers flags armed without a push).
 *
 * Written to a reused renderer xterm right before a fresh shell attaches, so
 * the new session starts from default input behavior. Never written on warm
 * reattach — there the daemon's rehydrate sequences own mode state.
 */
export const INPUT_MODE_DISARM_SEQUENCE = [
	...[...INPUT_REPORTING_DECSET_PARAMS].map((mode) => `${ESC}[?${mode}l`),
	// Terminal-behavior modes a dead TUI can leave latched. These stay in the
	// replayed scrollback (the log rendered under them, so stripping them would
	// hurt display fidelity) but a fresh shell must start clean: insert (IRM),
	// origin, and reverse-wraparound.
	`${ESC}[4l`,
	`${ESC}[?6l`,
	`${ESC}[?45l`,
	`${ESC}>`,
	`${ESC}[<255u`,
	`${ESC}[=0;1u`,
].join("");
