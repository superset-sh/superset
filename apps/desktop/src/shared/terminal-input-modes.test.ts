/**
 * Tests for #5508: cold-restore replay of a raw PTY log must not re-arm
 * input-reporting modes or answer replayed terminal queries, and the disarm
 * sequence must reset every mode a dead TUI can leave latched.
 */

import { describe, expect, test } from "bun:test";
import {
	INPUT_MODE_DISARM_SEQUENCE,
	sanitizeColdRestoreScrollback,
} from "./terminal-input-modes";

const ESC = "\x1b";
const CSI = `${ESC}[`;
const OSC = `${ESC}]`;
const BEL = "\x07";
const ST = `${ESC}\\`;

describe("sanitizeColdRestoreScrollback", () => {
	describe("input-reporting DECSET/DECRST stripping", () => {
		test.each([
			["app cursor keys", `${CSI}?1h`],
			["X10 mouse", `${CSI}?9h`],
			["normal mouse", `${CSI}?1000h`],
			["button-event mouse", `${CSI}?1002h`],
			["any-event mouse", `${CSI}?1003h`],
			["focus reporting", `${CSI}?1004h`],
			["UTF-8 mouse", `${CSI}?1005h`],
			["SGR mouse", `${CSI}?1006h`],
			["alternate scroll", `${CSI}?1007h`],
			["urxvt mouse", `${CSI}?1015h`],
			["SGR-pixels mouse", `${CSI}?1016h`],
			["bracketed paste", `${CSI}?2004h`],
			// The renderer xterm build implements DECSET 2031 (default-enabled
			// vtExtensions.colorSchemeQuery) and emits unsolicited CSI ?997;{1|2}n
			// on every theme change while it is armed — replaying the arming would
			// poison the fresh PTY on the next dark/light toggle (#5519 S1).
			["color-scheme update reports", `${CSI}?2031h`],
		])("strips %s arming", (_name, sequence) => {
			expect(sanitizeColdRestoreScrollback(`a${sequence}b`)).toBe("ab");
		});

		test("strips disarm forms too so replay never toggles input modes", () => {
			expect(sanitizeColdRestoreScrollback(`a${CSI}?1002l${CSI}?2004lb`)).toBe(
				"ab",
			);
		});

		test("removes a multi-param sequence made only of input modes", () => {
			expect(sanitizeColdRestoreScrollback(`${CSI}?1002;1006h`)).toBe("");
		});

		test("keeps display params when filtering mixed multi-param sequences", () => {
			expect(sanitizeColdRestoreScrollback(`${CSI}?1049;1002h`)).toBe(
				`${CSI}?1049h`,
			);
			expect(sanitizeColdRestoreScrollback(`${CSI}?25;1006;47l`)).toBe(
				`${CSI}?25;47l`,
			);
		});

		test.each([
			["alt screen enter", `${CSI}?1049h`],
			["legacy alt screen", `${CSI}?47h`],
			["cursor hide", `${CSI}?25l`],
			["auto-wrap", `${CSI}?7h`],
			["synchronized output", `${CSI}?2026h`],
			["cursor blink", `${CSI}?12h`],
		])("keeps display mode: %s", (_name, sequence) => {
			expect(sanitizeColdRestoreScrollback(`a${sequence}b`)).toBe(
				`a${sequence}b`,
			);
		});
	});

	describe("kitty keyboard protocol stripping", () => {
		test.each([
			["push with flags", `${CSI}>1u`],
			["push bare", `${CSI}>u`],
			["pop bare", `${CSI}<u`],
			["pop with count", `${CSI}<3u`],
			["set with mode", `${CSI}=5;1u`],
			["query", `${CSI}?u`],
			["query with params", `${CSI}?0u`],
		])("strips kitty %s", (_name, sequence) => {
			expect(sanitizeColdRestoreScrollback(`a${sequence}b`)).toBe("ab");
		});

		test("keeps SCO save/restore cursor which share the u/s finals", () => {
			expect(sanitizeColdRestoreScrollback(`a${CSI}s${CSI}ub`)).toBe(
				`a${CSI}s${CSI}ub`,
			);
		});
	});

	describe("terminal query stripping", () => {
		test.each([
			["DA1", `${CSI}c`],
			["DA1 explicit", `${CSI}0c`],
			["DA2", `${CSI}>c`],
			["DA2 explicit", `${CSI}>0c`],
			["DA3", `${CSI}=c`],
			["DSR status", `${CSI}5n`],
			["DSR cursor position", `${CSI}6n`],
			["DECXCPR", `${CSI}?6n`],
			["DECRQM private", `${CSI}?2026$p`],
			["DECRQM ansi", `${CSI}2$p`],
			["XTVERSION", `${CSI}>q`],
			["XTVERSION explicit", `${CSI}>0q`],
			["keypad application mode", `${ESC}=`],
			["keypad numeric mode", `${ESC}>`],
			["DECRQSS", `${ESC}P$qm${ST}`],
			// xterm dispatches DECRQSS on {intermediate $, final q} regardless of
			// params, so the param'd form is answered too (#5519 S2).
			["DECRQSS with params", `${ESC}P1$qm${ST}`],
			["DECRQSS with multiple params", `${ESC}P0;1$qr${ST}`],
			["OSC 10 fg query BEL", `${OSC}10;?${BEL}`],
			["OSC 11 bg query ST", `${OSC}11;?${ST}`],
			["OSC 12 cursor color query", `${OSC}12;?${BEL}`],
			["OSC 4 palette query", `${OSC}4;5;?${BEL}`],
			["OSC 52 clipboard query", `${OSC}52;c;?${BEL}`],
			["OSC 52 clipboard set", `${OSC}52;c;aGVsbG8=${BEL}`],
		])("strips %s", (_name, sequence) => {
			expect(sanitizeColdRestoreScrollback(`a${sequence}b`)).toBe("ab");
		});

		test.each([
			["DA1 response", `${CSI}?62;22c`],
			["OSC 0 title set", `${OSC}0;my title${BEL}`],
			["OSC 10 fg set", `${OSC}10;rgb:11/22/33${BEL}`],
			["OSC 4 palette set", `${OSC}4;5;#ffffff${BEL}`],
			["OSC 7 cwd report", `${OSC}7;file://host/tmp${BEL}`],
			["OSC 8 hyperlink", `${OSC}8;;https://example.com${ST}`],
			["OSC 133 prompt marker", `${OSC}133;A${BEL}`],
			["sixel-style DCS", `${ESC}Pq#0;2;0;0;0${ST}`],
		])("keeps %s", (_name, sequence) => {
			expect(sanitizeColdRestoreScrollback(`a${sequence}b`)).toBe(
				`a${sequence}b`,
			);
		});
	});

	describe("display content preservation", () => {
		test("keeps text, SGR colors, cursor movement, and erase sequences", () => {
			const log = `hello${CSI}31mred${CSI}0m${CSI}2J${CSI}1;5Hworld\r\n`;
			expect(sanitizeColdRestoreScrollback(log)).toBe(log);
		});

		test("sanitizes a realistic dead-TUI log down to its display parts", () => {
			const log = [
				`${OSC}7;file://host/repo${BEL}`,
				"$ claude\r\n",
				`${CSI}?1002h${CSI}?1003h${CSI}?1006h${CSI}?2004h${CSI}>1u`,
				`${CSI}c${CSI}6n${CSI}?u${OSC}11;?${BEL}`,
				`${CSI}31mWelcome${CSI}0m\r\n`,
			].join("");
			expect(sanitizeColdRestoreScrollback(log)).toBe(
				`${OSC}7;file://host/repo${BEL}$ claude\r\n${CSI}31mWelcome${CSI}0m\r\n`,
			);
		});
	});

	describe("C1 single-byte introducers", () => {
		const C1_CSI = String.fromCharCode(0x9b);
		const C1_OSC = String.fromCharCode(0x9d);

		test("strips input arming introduced by C1 CSI (U+009B)", () => {
			expect(sanitizeColdRestoreScrollback(`a${C1_CSI}?1002hb`)).toBe("ab");
		});

		test("strips a C1 OSC clipboard query", () => {
			expect(sanitizeColdRestoreScrollback(`a${C1_OSC}52;c;?${BEL}b`)).toBe(
				"ab",
			);
		});

		test("keeps a C1 CSI display sequence (normalized to ESC form)", () => {
			// U+009B ≡ CSI, so an SGR set is preserved (as its ESC[ equivalent).
			expect(sanitizeColdRestoreScrollback(`${C1_CSI}31mred`)).toBe(
				`${CSI}31mred`,
			);
		});

		test("consumes a C1 PM string so an embedded strip can't shift its scan", () => {
			// U+009E ≡ PM; its body runs to the C1 ST (U+009C). The kitty query
			// after it is removed and the trailing text survives (the PM does not
			// swallow it). ST normalizes to ESC-\, so assert by property.
			const pm = String.fromCharCode(0x9e);
			const st = String.fromCharCode(0x9c);
			const out = sanitizeColdRestoreScrollback(`${pm}hi${st}${CSI}?u world`);
			expect(out).not.toContain(`${CSI}?u`);
			expect(out).toContain(" world");
		});
	});

	describe("ESC-terminated OSC/DCS (this xterm dispatches on bare ESC)", () => {
		test("re-terminates a kept title set that ended on a following ESC sequence", () => {
			// The ESC that ended the OSC belongs to the *next* sequence. The kept
			// OSC must gain its own ST or the emitted bytes leave it open.
			const log = `${OSC}0;My Title${CSI}31mred`;
			expect(sanitizeColdRestoreScrollback(log)).toBe(
				`${OSC}0;My Title${ST}${CSI}31mred`,
			);
		});

		test("still drops an ESC-terminated clipboard query", () => {
			expect(sanitizeColdRestoreScrollback(`${OSC}52;c;?${CSI}0m`)).toBe(
				`${CSI}0m`,
			);
		});

		test("re-terminates a kept OSC whose terminator belonged to a stripped sequence", () => {
			// #5519 B5: the OSC's ending ESC introduced the DECSET that gets
			// stripped. Without an appended ST the sanitized stream contains a
			// still-open OSC that swallows everything after it — replaying this
			// input produced a blank screen instead of the prompt line.
			const raw = `${OSC}0;partial-title${CSI}?2004huser@host$ ls`;
			expect(sanitizeColdRestoreScrollback(raw)).toBe(
				`${OSC}0;partial-title${ST}user@host$ ls`,
			);
		});

		test("re-terminates a kept DCS the same way", () => {
			const raw = `${ESC}Pq#0;2;0;0;0${CSI}?2004hrest`;
			expect(sanitizeColdRestoreScrollback(raw)).toBe(
				`${ESC}Pq#0;2;0;0;0${ST}rest`,
			);
		});

		test("re-terminates a kept APC string the same way", () => {
			const raw = `${ESC}_payload${CSI}?uafter`;
			expect(sanitizeColdRestoreScrollback(raw)).toBe(
				`${ESC}_payload${ST}after`,
			);
		});

		test("re-terminated output is idempotent", () => {
			const raw = `${OSC}0;partial-title${CSI}?2004huser@host$ ls`;
			const once = sanitizeColdRestoreScrollback(raw);
			expect(sanitizeColdRestoreScrollback(once)).toBe(once);
		});
	});

	describe("OSC color set+query mixes (xterm applies sets, answers queries)", () => {
		// xterm walks OSC 4 payloads pair-wise: `?` entries are answered, color
		// spec entries are applied. Dropping the whole sequence loses the sets
		// and the restored scrollback renders with wrong 256-colors (#5519 D1).
		test("keeps the set pairs of a mixed OSC 4, stripping only queries", () => {
			expect(
				sanitizeColdRestoreScrollback(`${OSC}4;1;rgb:aa/00/00;2;?${BEL}`),
			).toBe(`${OSC}4;1;rgb:aa/00/00${BEL}`);
		});

		test("keeps set pairs regardless of pair order", () => {
			expect(
				sanitizeColdRestoreScrollback(`${OSC}4;2;?;1;rgb:aa/00/00${BEL}`),
			).toBe(`${OSC}4;1;rgb:aa/00/00${BEL}`);
		});

		test("preserves the ST terminator when rewriting OSC 4", () => {
			expect(sanitizeColdRestoreScrollback(`${OSC}4;1;red;2;?${ST}`)).toBe(
				`${OSC}4;1;red${ST}`,
			);
		});

		test("drops an OSC 4 made only of queries", () => {
			expect(
				sanitizeColdRestoreScrollback(`${OSC}4;5;?;6;?${BEL}`),
			).toBe("");
		});

		// OSC 10-12 payloads advance positionally (10;fg;bg sets fg then bg), so
		// a kept entry must be re-addressed to its effective color slot.
		test("re-addresses the kept set when an OSC 10 mixes query and set", () => {
			expect(
				sanitizeColdRestoreScrollback(`${OSC}10;?;rgb:11/22/33${BEL}`),
			).toBe(`${OSC}11;rgb:11/22/33${BEL}`);
		});

		test("keeps the leading set and strips the trailing query of an OSC 10", () => {
			expect(
				sanitizeColdRestoreScrollback(`${OSC}10;rgb:aa/bb/cc;?${BEL}`),
			).toBe(`${OSC}10;rgb:aa/bb/cc${BEL}`);
		});
	});

	describe("C0 controls embedded in a CSI (xterm executes and keeps collecting)", () => {
		test("emits the C0 and keeps collecting the sequence", () => {
			// Raw replay executes VT then applies SGR 34; dropping the head and
			// re-emitting "4m" as text diverges from that (#5519 D2).
			expect(sanitizeColdRestoreScrollback(`${CSI}3\x0b4mRED`)).toBe(
				`\x0b${CSI}34mRED`,
			);
		});

		test("still strips an input-arming DECSET reassembled around a C0", () => {
			expect(sanitizeColdRestoreScrollback(`${CSI}?100\x0b2h`)).toBe("\x0b");
		});

		test("ignores DEL mid-collect like xterm", () => {
			expect(sanitizeColdRestoreScrollback(`${CSI}3\x7f4mX`)).toBe(
				`${CSI}34mX`,
			);
		});

		test("CAN still cancels the sequence and keeps following text", () => {
			expect(sanitizeColdRestoreScrollback(`${CSI}31\x18mX`)).toBe("mX");
		});
	});

	describe("CSI sequences carrying intermediates are never rewritten", () => {
		test("passes an unrecognized intermediate-bearing lookalike through verbatim", () => {
			// `CSI ?1049;1002$h` has no xterm handler — a no-op on raw replay.
			// Rewriting it to `CSI ?1049h` would manufacture an alt-screen switch
			// that never executed (#5519 D3).
			const seq = `${CSI}?1049;1002$h`;
			expect(sanitizeColdRestoreScrollback(`a${seq}b`)).toBe(`a${seq}b`);
		});

		test("keeps DECSCUSR-style sequences with a space intermediate", () => {
			const seq = `${CSI}4 q`;
			expect(sanitizeColdRestoreScrollback(`a${seq}b`)).toBe(`a${seq}b`);
		});
	});

	describe("CAN/SUB abort inside a string sequence", () => {
		const CAN = "\x18";
		const SUB = "\x1a";

		test("keeps display text after a CAN aborts a clipboard OSC", () => {
			// xterm aborts the OSC at CAN and renders the rest as text; the
			// scanner must drop only the OSC prefix, not the trailing text.
			expect(
				sanitizeColdRestoreScrollback(`A${OSC}52;c;?${CAN} hello ${BEL}B`),
			).toBe(`A hello ${BEL}B`);
		});

		test("keeps display text after a SUB aborts a DCS", () => {
			expect(sanitizeColdRestoreScrollback(`A${ESC}P$qm${SUB}text${ST}B`)).toBe(
				`Atext${ST}B`,
			);
		});
	});

	describe("colon sub-parameters", () => {
		test("strips a DECSET keyed on a colon-joined input mode", () => {
			expect(sanitizeColdRestoreScrollback(`${CSI}?1000:1006h`)).toBe("");
		});

		test("keeps a display DECSET carrying a colon sub-parameter", () => {
			expect(sanitizeColdRestoreScrollback(`${CSI}?1049:1h`)).toBe(
				`${CSI}?1049:1h`,
			);
		});
	});

	describe("size-report queries", () => {
		test.each([
			["XTWINOPS text-area pixels", `${CSI}14t`],
			["XTWINOPS cell pixels", `${CSI}16t`],
			["XTWINOPS text-area chars", `${CSI}18t`],
			["XTSMGRAPHICS query", `${CSI}?2;1;0S`],
		])("strips %s (answered by ImageAddon)", (_name, sequence) => {
			expect(sanitizeColdRestoreScrollback(`a${sequence}b`)).toBe("ab");
		});

		test("keeps scroll-up (SU), which shares the S final without a prefix", () => {
			expect(sanitizeColdRestoreScrollback(`a${CSI}3Sb`)).toBe(`a${CSI}3Sb`);
		});
	});

	describe("robustness", () => {
		test("is idempotent", () => {
			const log = `a${CSI}?1002h${CSI}?u${OSC}11;?${BEL}b${CSI}?1049h`;
			const once = sanitizeColdRestoreScrollback(log);
			expect(sanitizeColdRestoreScrollback(once)).toBe(once);
		});

		test("kills a nested arming sequence in a single pass (no matryoshka)", () => {
			// Five aborted `CSI ?1002` fragments then five `h` — a real xterm
			// aborts the first four, sets mouse on the fifth, and prints "hhhh".
			// The scan must leave no arming behind and no fixpoint to defeat.
			const log = `${CSI}?1002${CSI}?1002${CSI}?1002${CSI}?1002${CSI}?1002hhhhh`;
			expect(sanitizeColdRestoreScrollback(log)).toBe("hhhh");
		});

		test("keeps bare text that is not a real query after an aborted CSI", () => {
			// `6n` has no CSI prefix, so it is literal text, not a DSR query.
			expect(sanitizeColdRestoreScrollback(`${CSI}${CSI}?u6n`)).toBe("6n");
		});

		test("stays linear on adversarial color-query input (no ReDoS)", () => {
			// An unterminated OSC-4 followed by a long "?" run is the classic
			// backtracking trap for a query-stripping regex. The scan is a single
			// linear pass, so a ~500KB block completes in milliseconds; a
			// super-linear regression would blow the test timeout instead.
			const adversarial = `${OSC}4;${"?".repeat(600)}`.repeat(830);
			expect(sanitizeColdRestoreScrollback(adversarial)).toBe("");
		});

		test("handles empty input", () => {
			expect(sanitizeColdRestoreScrollback("")).toBe("");
		});
	});
});

describe("INPUT_MODE_DISARM_SEQUENCE", () => {
	test("disarms every tracked input-reporting mode", () => {
		for (const mode of [
			1, 9, 1000, 1001, 1002, 1003, 1004, 1005, 1006, 1007, 1015, 1016, 2004,
			2031,
		]) {
			expect(INPUT_MODE_DISARM_SEQUENCE).toContain(`${CSI}?${mode}l`);
		}
	});

	test("unwinds the kitty keyboard stack and zeroes its flags", () => {
		expect(INPUT_MODE_DISARM_SEQUENCE).toContain(`${CSI}<255u`);
		expect(INPUT_MODE_DISARM_SEQUENCE).toContain(`${CSI}=0;1u`);
	});

	test("resets the keypad to numeric mode", () => {
		expect(INPUT_MODE_DISARM_SEQUENCE).toContain(`${ESC}>`);
	});

	test("never arms anything", () => {
		expect(INPUT_MODE_DISARM_SEQUENCE).not.toMatch(/\[\?[0-9;]+h/);
	});

	test("sanitizing the disarm sequence removes it entirely", () => {
		// The disarm bundle is itself pure input-mode traffic, so the replay
		// sanitizer must treat all of it as strippable.
		expect(sanitizeColdRestoreScrollback(INPUT_MODE_DISARM_SEQUENCE)).toBe("");
	});
});
