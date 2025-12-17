import { describe, expect, it } from "bun:test";
import {
	containsClearScrollbackSequence,
	extractContentAfterClear,
	filterTerminalQueryResponses,
	TerminalEscapeFilter,
} from "./terminal-escape-filter";

const ESC = "\x1b";
const BEL = "\x07";

describe("filterTerminalQueryResponses", () => {
	describe("preserves normal terminal output", () => {
		it("should return empty string unchanged", () => {
			expect(filterTerminalQueryResponses("")).toBe("");
		});

		it("should preserve plain text", () => {
			expect(filterTerminalQueryResponses("hello world")).toBe("hello world");
		});

		it("should preserve text with newlines", () => {
			const input = "line1\nline2\r\nline3";
			expect(filterTerminalQueryResponses(input)).toBe(input);
		});

		it("should preserve ANSI color codes", () => {
			const colored = `${ESC}[32mgreen text${ESC}[0m`;
			expect(filterTerminalQueryResponses(colored)).toBe(colored);
		});

		it("should preserve cursor movement sequences", () => {
			const cursorMove = `${ESC}[H${ESC}[2J`; // Home + clear screen
			expect(filterTerminalQueryResponses(cursorMove)).toBe(cursorMove);
		});

		it("should preserve text styling sequences", () => {
			const styled = `${ESC}[1mbold${ESC}[0m ${ESC}[4munderline${ESC}[0m`;
			expect(filterTerminalQueryResponses(styled)).toBe(styled);
		});
	});

	describe("filters Cursor Position Reports (CPR)", () => {
		it("should filter basic CPR response", () => {
			const cpr = `${ESC}[24;1R`;
			expect(filterTerminalQueryResponses(cpr)).toBe("");
		});

		it("should filter CPR with single digit positions", () => {
			const cpr = `${ESC}[1;1R`;
			expect(filterTerminalQueryResponses(cpr)).toBe("");
		});

		it("should filter CPR with row only (no column)", () => {
			const cpr = `${ESC}[2R`;
			expect(filterTerminalQueryResponses(cpr)).toBe("");
		});

		it("should filter CPR with single digit row only", () => {
			const cpr = `${ESC}[1R`;
			expect(filterTerminalQueryResponses(cpr)).toBe("");
		});

		it("should filter CPR with large positions", () => {
			const cpr = `${ESC}[999;999R`;
			expect(filterTerminalQueryResponses(cpr)).toBe("");
		});

		it("should filter CPR mixed with text", () => {
			const input = `before${ESC}[24;80Rafter`;
			expect(filterTerminalQueryResponses(input)).toBe("beforeafter");
		});

		it("should filter multiple CPR responses", () => {
			const input = `${ESC}[1;1R${ESC}[24;80R`;
			expect(filterTerminalQueryResponses(input)).toBe("");
		});

		it("should filter mixed full and row-only CPRs", () => {
			const input = `${ESC}[2R${ESC}[1R${ESC}[24;80R`;
			expect(filterTerminalQueryResponses(input)).toBe("");
		});
	});

	describe("filters Primary Device Attributes (DA1)", () => {
		it("should filter VT100 response", () => {
			const da1 = `${ESC}[?1;0c`;
			expect(filterTerminalQueryResponses(da1)).toBe("");
		});

		it("should filter VT100 with options", () => {
			const da1 = `${ESC}[?1;2c`;
			expect(filterTerminalQueryResponses(da1)).toBe("");
		});

		it("should filter xterm-style DA1", () => {
			const da1 = `${ESC}[?62;1;2;6;7;8;9;15c`;
			expect(filterTerminalQueryResponses(da1)).toBe("");
		});

		it("should filter simple DA1 response", () => {
			const da1 = `${ESC}[?c`;
			expect(filterTerminalQueryResponses(da1)).toBe("");
		});

		it("should filter DA1 mixed with text", () => {
			const input = `prompt$ ${ESC}[?1;0c command`;
			expect(filterTerminalQueryResponses(input)).toBe("prompt$  command");
		});
	});

	describe("filters Secondary Device Attributes (DA2)", () => {
		it("should filter basic DA2 response", () => {
			const da2 = `${ESC}[>0;276;0c`;
			expect(filterTerminalQueryResponses(da2)).toBe("");
		});

		it("should filter DA2 with different version", () => {
			const da2 = `${ESC}[>41;354;0c`;
			expect(filterTerminalQueryResponses(da2)).toBe("");
		});

		it("should filter simple DA2 response", () => {
			const da2 = `${ESC}[>c`;
			expect(filterTerminalQueryResponses(da2)).toBe("");
		});

		it("should filter DA2 mixed with other sequences", () => {
			const input = `${ESC}[32m${ESC}[>0;276;0cgreen`;
			expect(filterTerminalQueryResponses(input)).toBe(`${ESC}[32mgreen`);
		});
	});

	describe("filters Device Attributes without prefix", () => {
		it("should filter DA response without ? or > prefix", () => {
			const da = `${ESC}[0;276;0c`;
			expect(filterTerminalQueryResponses(da)).toBe("");
		});

		it("should filter simple DA response without prefix", () => {
			const da = `${ESC}[1;0c`;
			expect(filterTerminalQueryResponses(da)).toBe("");
		});

		it("should filter DA with multiple params", () => {
			const da = `${ESC}[62;1;2;6;7;8;9c`;
			expect(filterTerminalQueryResponses(da)).toBe("");
		});
	});

	describe("filters DEC Private Mode Reports (DECRPM)", () => {
		it("should filter mode set response", () => {
			const decrpm = `${ESC}[?1;1$y`; // Mode 1 is set
			expect(filterTerminalQueryResponses(decrpm)).toBe("");
		});

		it("should filter mode reset response", () => {
			const decrpm = `${ESC}[?1;2$y`; // Mode 1 is reset
			expect(filterTerminalQueryResponses(decrpm)).toBe("");
		});

		it("should filter mode permanently set response", () => {
			const decrpm = `${ESC}[?25;3$y`; // Mode 25 permanently set
			expect(filterTerminalQueryResponses(decrpm)).toBe("");
		});

		it("should filter mode permanently reset response", () => {
			const decrpm = `${ESC}[?12;4$y`; // Mode 12 permanently reset
			expect(filterTerminalQueryResponses(decrpm)).toBe("");
		});

		it("should filter multiple DECRPM responses", () => {
			const input = `${ESC}[?1;2$y${ESC}[?25;1$y${ESC}[?12;2$y`;
			expect(filterTerminalQueryResponses(input)).toBe("");
		});
	});

	describe("filters OSC color responses", () => {
		it("should filter OSC 10 (foreground) with BEL terminator", () => {
			const osc10 = `${ESC}]10;rgb:ffff/ffff/ffff${BEL}`;
			expect(filterTerminalQueryResponses(osc10)).toBe("");
		});

		it("should filter OSC 10 with ST terminator", () => {
			const osc10 = `${ESC}]10;rgb:0000/0000/0000${ESC}\\`;
			expect(filterTerminalQueryResponses(osc10)).toBe("");
		});

		it("should filter OSC 11 (background)", () => {
			const osc11 = `${ESC}]11;rgb:1c1c/1c1c/1c1c${BEL}`;
			expect(filterTerminalQueryResponses(osc11)).toBe("");
		});

		it("should filter OSC 12 (cursor color)", () => {
			const osc12 = `${ESC}]12;rgb:00ff/00ff/00ff${BEL}`;
			expect(filterTerminalQueryResponses(osc12)).toBe("");
		});

		it("should filter OSC 13-19 (highlight colors)", () => {
			for (let i = 13; i <= 19; i++) {
				const osc = `${ESC}]${i};rgb:aaaa/bbbb/cccc${BEL}`;
				expect(filterTerminalQueryResponses(osc)).toBe("");
			}
		});

		it("should filter mixed case hex values", () => {
			const osc = `${ESC}]10;rgb:AbCd/EfAb/1234${BEL}`;
			expect(filterTerminalQueryResponses(osc)).toBe("");
		});

		it("should filter multiple OSC responses", () => {
			const input =
				`${ESC}]10;rgb:ffff/ffff/ffff${BEL}` +
				`${ESC}]11;rgb:0000/0000/0000${BEL}` +
				`${ESC}]12;rgb:00ff/00ff/00ff${BEL}`;
			expect(filterTerminalQueryResponses(input)).toBe("");
		});

		it("should filter short-form (2-digit) hex color responses", () => {
			const osc10 = `${ESC}]10;rgb:f5/f5/f5${BEL}`;
			expect(filterTerminalQueryResponses(osc10)).toBe("");
		});

		it("should filter short-form hex with ST terminator", () => {
			const osc11 = `${ESC}]11;rgb:1a/1a/1a${ESC}\\`;
			expect(filterTerminalQueryResponses(osc11)).toBe("");
		});

		it("should filter 3-digit hex color responses", () => {
			const osc10 = `${ESC}]10;rgb:fff/fff/fff${BEL}`;
			expect(filterTerminalQueryResponses(osc10)).toBe("");
		});
	});

	describe("filters Standard Mode Reports", () => {
		it("should filter standard mode report", () => {
			const report = `${ESC}[12;2$y`;
			expect(filterTerminalQueryResponses(report)).toBe("");
		});

		it("should filter mode report with different values", () => {
			const report = `${ESC}[4;1$y`;
			expect(filterTerminalQueryResponses(report)).toBe("");
		});
	});

	describe("filters Tertiary Device Attributes (DA3)", () => {
		it("should filter DA3 response with unit ID", () => {
			const da3 = `${ESC}P!|00000000${ESC}\\`;
			expect(filterTerminalQueryResponses(da3)).toBe("");
		});

		it("should filter DA3 response with alphanumeric ID", () => {
			const da3 = `${ESC}P!|7E565445${ESC}\\`;
			expect(filterTerminalQueryResponses(da3)).toBe("");
		});
	});

	describe("filters XTVERSION responses", () => {
		it("should filter xterm version response", () => {
			const xtversion = `${ESC}P>|XTerm(354)${ESC}\\`;
			expect(filterTerminalQueryResponses(xtversion)).toBe("");
		});

		it("should filter custom terminal version", () => {
			const xtversion = `${ESC}P>|MyTerminal 1.0${ESC}\\`;
			expect(filterTerminalQueryResponses(xtversion)).toBe("");
		});
	});

	describe("handles complex mixed content", () => {
		it("should filter all query responses from realistic output", () => {
			const input =
				`$ echo hello${ESC}[24;1R\n` +
				`hello\n` +
				`${ESC}[?1;0c${ESC}[>0;276;0c` +
				`${ESC}]10;rgb:ffff/ffff/ffff${BEL}` +
				`${ESC}]11;rgb:0000/0000/0000${BEL}` +
				`${ESC}[?1;2$y` +
				`$ `;

			const expected = `$ echo hello\nhello\n$ `;
			expect(filterTerminalQueryResponses(input)).toBe(expected);
		});

		it("should handle interleaved responses and output", () => {
			const input = `a${ESC}[1;1Rb${ESC}[?1;0cc${ESC}]10;rgb:ffff/ffff/ffff${BEL}d`;
			expect(filterTerminalQueryResponses(input)).toBe("abcd");
		});

		it("should preserve colored output while filtering responses", () => {
			const input = `${ESC}[32mSuccess${ESC}[0m${ESC}[24;1R${ESC}[?1;0c\n`;
			const expected = `${ESC}[32mSuccess${ESC}[0m\n`;
			expect(filterTerminalQueryResponses(input)).toBe(expected);
		});

		it("should handle the exact user-reported issue", () => {
			// User reported: 2R1R0;276;0c10;rgb:ffff/ffff/ffff11;rgb:0000/0000/000012;2$y
			// This is the interpreted version with escape sequences
			const input =
				`${ESC}[2R${ESC}[1R${ESC}[0;276;0c` +
				`${ESC}]10;rgb:ffff/ffff/ffff${BEL}` +
				`${ESC}]11;rgb:0000/0000/0000${BEL}` +
				`${ESC}[?12;2$y`;

			expect(filterTerminalQueryResponses(input)).toBe("");
		});

		it("should handle rapid successive responses", () => {
			const responses = [
				`${ESC}[1;1R`,
				`${ESC}[?1;0c`,
				`${ESC}[>0;276;0c`,
				`${ESC}]10;rgb:ffff/ffff/ffff${BEL}`,
				`${ESC}]11;rgb:0000/0000/0000${BEL}`,
				`${ESC}]12;rgb:00ff/00ff/00ff${BEL}`,
				`${ESC}[?1;2$y`,
				`${ESC}[?25;1$y`,
			];
			const input = responses.join("");
			expect(filterTerminalQueryResponses(input)).toBe("");
		});
	});

	describe("edge cases", () => {
		it("should handle data with only ESC characters", () => {
			const input = `${ESC}${ESC}${ESC}`;
			expect(filterTerminalQueryResponses(input)).toBe(input);
		});

		it("should not filter incomplete CPR sequence", () => {
			const incomplete = `${ESC}[24;`; // Missing R
			expect(filterTerminalQueryResponses(incomplete)).toBe(incomplete);
		});

		it("should not filter incomplete DA1 sequence", () => {
			const incomplete = `${ESC}[?1;0`; // Missing c
			expect(filterTerminalQueryResponses(incomplete)).toBe(incomplete);
		});

		it("should not filter incomplete OSC sequence", () => {
			const incomplete = `${ESC}]10;rgb:ffff/ffff/ffff`; // Missing terminator
			expect(filterTerminalQueryResponses(incomplete)).toBe(incomplete);
		});

		it("should handle very long strings efficiently", () => {
			const longText = "x".repeat(100000);
			const withResponse = `${longText}${ESC}[24;1R${longText}`;
			const result = filterTerminalQueryResponses(withResponse);
			expect(result).toBe(longText + longText);
		});

		it("should handle unicode content", () => {
			const unicode = `日本語${ESC}[24;1Rテスト🎉`;
			expect(filterTerminalQueryResponses(unicode)).toBe("日本語テスト🎉");
		});

		it("should handle binary-like content", () => {
			const binary = `\x00\x01\x02${ESC}[24;1R\x03\x04\x05`;
			expect(filterTerminalQueryResponses(binary)).toBe(
				"\x00\x01\x02\x03\x04\x05",
			);
		});
	});
});

describe("TUI application scenarios (Claude Code, Codex)", () => {
	describe("filters CPR responses generated by TUI cursor queries", () => {
		it("should filter rapid CPR bursts from TUI redraws", () => {
			// TUIs like Claude Code query cursor position frequently during redraws
			const cprBurst =
				`${ESC}[1;1R${ESC}[1;1R${ESC}[9;3R${ESC}[3;3R${ESC}[9;50R` +
				`${ESC}[9;1R${ESC}[7;3R${ESC}[7;3R${ESC}[3;3R${ESC}[7;3R`;
			expect(filterTerminalQueryResponses(cprBurst)).toBe("");
		});

		it("should filter CPR responses interleaved with TUI output", () => {
			// Simulates TUI drawing UI while receiving CPR responses
			const input =
				`${ESC}[32m┌──────┐${ESC}[0m${ESC}[1;1R` +
				`${ESC}[32m│ Menu │${ESC}[0m${ESC}[2;80R` +
				`${ESC}[32m└──────┘${ESC}[0m${ESC}[3;1R`;
			const expected =
				`${ESC}[32m┌──────┐${ESC}[0m` +
				`${ESC}[32m│ Menu │${ESC}[0m` +
				`${ESC}[32m└──────┘${ESC}[0m`;
			expect(filterTerminalQueryResponses(input)).toBe(expected);
		});

		it("should filter multiple query types from TUI initialization", () => {
			// TUIs query multiple terminal capabilities on startup
			const initQueries =
				`${ESC}[1;1R` + // CPR
				`${ESC}[?1;0c` + // DA1
				`${ESC}[>0;276;0c` + // DA2
				`${ESC}]10;rgb:ffff/ffff/ffff${BEL}` + // OSC 10 foreground
				`${ESC}]11;rgb:1a1a/1a1a/1a1a${BEL}` + // OSC 11 background
				`${ESC}[?1;2$y`; // DECRPM
			expect(filterTerminalQueryResponses(initQueries)).toBe("");
		});

		it("should handle tab switch scenario: accumulated CPR responses", () => {
			// When switching tabs, TUI keeps running and CPR responses accumulate
			// This is the exact bug scenario - responses queue up during tab switch
			const accumulated =
				`${ESC}[1;1R${ESC}[1;1R${ESC}[9;3R${ESC}[3;3R${ESC}[9;50R${ESC}[9;1R` +
				`${ESC}[7;3R${ESC}[7;3R${ESC}[3;3R${ESC}[7;3R${ESC}[7;3R${ESC}[3;3R` +
				`${ESC}[7;3R${ESC}[9;1R${ESC}[1;1R${ESC}[1;1R${ESC}[9;3R${ESC}[3;3R`;
			expect(filterTerminalQueryResponses(accumulated)).toBe("");
		});
	});

	describe("stateful filter handles chunked TUI output", () => {
		it("should filter CPR split across chunks during TUI redraw", () => {
			const filter = new TerminalEscapeFilter();
			// Simulates network/IPC chunking during rapid TUI updates
			const chunk1 = `${ESC}[32m┌──────┐${ESC}[0m${ESC}[24;`;
			const chunk2 = `80R${ESC}[32m│ Menu │${ESC}[0m`;
			const result1 = filter.filter(chunk1);
			const result2 = filter.filter(chunk2);
			expect(result1 + result2).toBe(
				`${ESC}[32m┌──────┐${ESC}[0m${ESC}[32m│ Menu │${ESC}[0m`,
			);
		});

		it("should handle rapid state changes from TUI event loop", () => {
			const filter = new TerminalEscapeFilter();
			// Simulate TUI sending multiple queries in tight loop
			const chunks = [`text1${ESC}[1;`, `1R`, `text2${ESC}[2;`, `80R`, `text3`];
			let result = "";
			for (const chunk of chunks) {
				result += filter.filter(chunk);
			}
			expect(result).toBe("text1text2text3");
		});

		it("should filter accumulated responses when tab regains focus", () => {
			const filter = new TerminalEscapeFilter();
			// Simulates the burst of accumulated responses sent to xterm on refocus
			const accumulated = [
				`${ESC}[1;1R${ESC}[1;1R${ESC}[9;3R`,
				`${ESC}[3;3R${ESC}[9;50R${ESC}[9;1R`,
				`${ESC}[7;3R${ESC}[7;3R`,
				`Welcome back!`, // TUI greeting after responses
			];
			let result = "";
			for (const chunk of accumulated) {
				result += filter.filter(chunk);
			}
			expect(result).toBe("Welcome back!");
		});

		it("should NOT buffer ESC alone - too common, causes lag", () => {
			const filter = new TerminalEscapeFilter();
			// ESC alone should pass through immediately for performance
			const chunk1 = `output${ESC}`;
			const result1 = filter.filter(chunk1);
			expect(result1).toBe(`output${ESC}`);
		});

		it("should NOT buffer ESC[ alone - too common, causes lag", () => {
			const filter = new TerminalEscapeFilter();
			// ESC[ alone should pass through immediately for performance
			const chunk1 = `output${ESC}[`;
			const result1 = filter.filter(chunk1);
			expect(result1).toBe(`output${ESC}[`);
		});

		it("should buffer ESC[ followed by digit (potential CPR)", () => {
			const filter = new TerminalEscapeFilter();
			// ESC[1 is buffered because it could be start of CPR
			const chunk1 = `output${ESC}[1`;
			const chunk2 = `;80R`;
			const result1 = filter.filter(chunk1);
			const result2 = filter.filter(chunk2);
			expect(result1 + result2).toBe("output");
		});

		it("should handle CPR split after digit", () => {
			const filter = new TerminalEscapeFilter();
			// This is the realistic case - CPR split after the digit
			const chunks = [`text${ESC}[1`, `;1R${ESC}[3`, `;3R${ESC}[3`, `R`];
			let result = "";
			for (const chunk of chunks) {
				result += filter.filter(chunk);
			}
			expect(result).toBe("text");
		});

		it("should handle ESC]1 at chunk boundary for OSC", () => {
			const filter = new TerminalEscapeFilter();
			// ESC]1 is buffered (OSC 10-19 pattern)
			const chunk1 = `text${ESC}]1`;
			const chunk2 = `0;rgb:ffff/ffff/ffff${BEL}more`;
			const result1 = filter.filter(chunk1);
			const result2 = filter.filter(chunk2);
			expect(result1 + result2).toBe("textmore");
		});

		it("should pass through non-query CSI after buffering ESC[digit", () => {
			const filter = new TerminalEscapeFilter();
			// ESC[3 buffered (could be CPR), but completed as color code
			const chunk1 = `text${ESC}[3`;
			const chunk2 = `2mgreen`;
			const result1 = filter.filter(chunk1);
			const result2 = filter.filter(chunk2);
			expect(result1 + result2).toBe(`text${ESC}[32mgreen`);
		});
	});
});

describe("TerminalEscapeFilter (stateful)", () => {
	describe("handles chunked data", () => {
		it("should reassemble split DA1 response", () => {
			const filter = new TerminalEscapeFilter();
			// DA1 response split across chunks
			const chunk1 = `hello${ESC}[?`;
			const chunk2 = `1;0c`;
			const result1 = filter.filter(chunk1);
			const result2 = filter.filter(chunk2);
			expect(result1 + result2).toBe("hello");
		});

		it("should reassemble split standard mode report", () => {
			const filter = new TerminalEscapeFilter();
			// Standard mode report ESC[12;2$y split across chunks
			const chunk1 = `text${ESC}[1`;
			const chunk2 = `2;2$y`;
			const result1 = filter.filter(chunk1);
			const result2 = filter.filter(chunk2);
			expect(result1 + result2).toBe("text");
		});

		it("should reassemble split CPR with row only", () => {
			const filter = new TerminalEscapeFilter();
			// CPR ESC[2R split across chunks
			const chunk1 = `prompt${ESC}[2`;
			const chunk2 = `R`;
			const result1 = filter.filter(chunk1);
			const result2 = filter.filter(chunk2);
			expect(result1 + result2).toBe("prompt");
		});

		it("should reassemble split OSC color response", () => {
			const filter = new TerminalEscapeFilter();
			// OSC 10 response split across chunks
			const chunk1 = `text${ESC}]1`;
			const chunk2 = `0;rgb:ffff/ffff/ffff${BEL}more`;
			const result1 = filter.filter(chunk1);
			const result2 = filter.filter(chunk2);
			expect(result1 + result2).toBe("textmore");
		});

		it("should buffer digit CSI but pass through color codes when complete", () => {
			const filter = new TerminalEscapeFilter();
			// Color sequence is buffered initially (could be CPR/mode report)
			const chunk1 = `text${ESC}[32`;
			const chunk2 = `mgreen`;
			const result1 = filter.filter(chunk1);
			const result2 = filter.filter(chunk2);
			// First chunk buffered, second chunk completes sequence
			// Color code doesn't match filter patterns, so passes through
			expect(result1).toBe("text");
			expect(result2).toBe(`${ESC}[32mgreen`);
		});

		it("should NOT buffer ESC alone - passes through for performance", () => {
			const filter = new TerminalEscapeFilter();
			const chunk1 = `text${ESC}`;
			const result1 = filter.filter(chunk1);
			// ESC alone passes through immediately - buffering causes lag
			expect(result1).toBe(`text${ESC}`);
		});

		it("should NOT buffer ESC [ alone - passes through for performance", () => {
			const filter = new TerminalEscapeFilter();
			const chunk1 = `text${ESC}[`;
			const result1 = filter.filter(chunk1);
			// ESC [ alone passes through immediately - buffering causes lag
			expect(result1).toBe(`text${ESC}[`);
		});

		it("should buffer ESC [ digit (could be CPR/mode report/DA)", () => {
			const filter = new TerminalEscapeFilter();
			const chunk1 = `text${ESC}[2`;
			const result1 = filter.filter(chunk1);
			// ESC [ digit is buffered - could be start of CPR, mode report, or DA
			// When complete, if it's a color code it will pass through (no match)
			expect(result1).toBe("text");
			// Complete with R (CPR) - should be filtered
			const result2 = filter.filter("R");
			expect(result2).toBe("");
		});

		it("should pass through color codes when complete", () => {
			const filter = new TerminalEscapeFilter();
			// Color code split at chunk boundary
			const chunk1 = `text${ESC}[32`;
			const result1 = filter.filter(chunk1);
			expect(result1).toBe("text"); // Buffered
			// Complete with m - not a query response, passes through
			const result2 = filter.filter("mgreen");
			expect(result2).toBe(`${ESC}[32mgreen`);
		});

		it("should NOT buffer complete CSI followed by text", () => {
			const filter = new TerminalEscapeFilter();
			// Complete color code followed by text at chunk end
			const chunk = `hello${ESC}[31mworld\n`;
			const result = filter.filter(chunk);
			// Should pass through immediately - CSI is complete
			expect(result).toBe(`hello${ESC}[31mworld\n`);
		});

		it("should NOT buffer SGR reset followed by prompt", () => {
			const filter = new TerminalEscapeFilter();
			// Reset code followed by prompt
			const chunk = `${ESC}[0m$ `;
			const result = filter.filter(chunk);
			expect(result).toBe(`${ESC}[0m$ `);
		});
	});

	describe("flush behavior", () => {
		it("should flush buffered incomplete sequence", () => {
			const filter = new TerminalEscapeFilter();
			const chunk = `hello${ESC}[?1;0`; // Incomplete DA1
			const result = filter.filter(chunk);
			expect(result).toBe("hello");
			// Flush returns the buffered data (filtered)
			const flushed = filter.flush();
			expect(flushed).toBe(`${ESC}[?1;0`); // Not filtered because incomplete
		});

		it("should return empty on flush when no buffer", () => {
			const filter = new TerminalEscapeFilter();
			filter.filter("complete data");
			expect(filter.flush()).toBe("");
		});
	});

	describe("reset behavior", () => {
		it("should clear buffer on reset", () => {
			const filter = new TerminalEscapeFilter();
			filter.filter(`text${ESC}[?1;0`); // Leaves incomplete in buffer
			filter.reset();
			expect(filter.flush()).toBe(""); // Buffer was cleared
		});
	});

	describe("preserves normal output", () => {
		it("should not buffer or delay normal text", () => {
			const filter = new TerminalEscapeFilter();
			const result = filter.filter("normal text output");
			expect(result).toBe("normal text output");
		});

		it("should preserve ANSI colors even at chunk boundaries", () => {
			const filter = new TerminalEscapeFilter();
			const chunk1 = `${ESC}[31mred${ESC}`;
			const chunk2 = `[0mnormal`;
			const result1 = filter.filter(chunk1);
			const result2 = filter.filter(chunk2);
			// Colors should pass through
			expect(result1 + result2).toBe(`${ESC}[31mred${ESC}[0mnormal`);
		});
	});
});

describe("containsClearScrollbackSequence", () => {
	it("should detect ED3 sequence", () => {
		expect(containsClearScrollbackSequence(`${ESC}[3J`)).toBe(true);
	});

	it("should detect RIS sequence", () => {
		expect(containsClearScrollbackSequence(`${ESC}c`)).toBe(true);
	});

	it("should detect ED3 in mixed content", () => {
		expect(containsClearScrollbackSequence(`before${ESC}[3Jafter`)).toBe(true);
	});

	it("should detect RIS in mixed content", () => {
		expect(containsClearScrollbackSequence(`before${ESC}cafter`)).toBe(true);
	});

	it("should return false for no clear sequence", () => {
		expect(containsClearScrollbackSequence("normal text")).toBe(false);
	});

	it("should return false for other escape sequences", () => {
		expect(containsClearScrollbackSequence(`${ESC}[2J`)).toBe(false); // Clear screen (not scrollback)
		expect(containsClearScrollbackSequence(`${ESC}[H`)).toBe(false); // Cursor home
	});
});

describe("extractContentAfterClear", () => {
	describe("ED3 sequence handling", () => {
		it("should return empty string for ED3 only", () => {
			expect(extractContentAfterClear(`${ESC}[3J`)).toBe("");
		});

		it("should return content after ED3", () => {
			expect(extractContentAfterClear(`${ESC}[3Jnew content`)).toBe(
				"new content",
			);
		});

		it("should drop content before ED3", () => {
			expect(extractContentAfterClear(`old stuff${ESC}[3Jnew content`)).toBe(
				"new content",
			);
		});

		it("should handle ED3 at end of data", () => {
			expect(extractContentAfterClear(`some content${ESC}[3J`)).toBe("");
		});

		it("should handle multiple ED3 sequences - use last one", () => {
			expect(extractContentAfterClear(`a${ESC}[3Jb${ESC}[3Jc`)).toBe("c");
		});
	});

	describe("RIS sequence handling", () => {
		it("should return empty string for RIS only", () => {
			expect(extractContentAfterClear(`${ESC}c`)).toBe("");
		});

		it("should return content after RIS", () => {
			expect(extractContentAfterClear(`${ESC}cnew content`)).toBe(
				"new content",
			);
		});

		it("should drop content before RIS", () => {
			expect(extractContentAfterClear(`old stuff${ESC}cnew content`)).toBe(
				"new content",
			);
		});

		it("should handle RIS at end of data", () => {
			expect(extractContentAfterClear(`some content${ESC}c`)).toBe("");
		});

		it("should handle multiple RIS sequences - use last one", () => {
			expect(extractContentAfterClear(`a${ESC}cb${ESC}cc`)).toBe("c");
		});
	});

	describe("mixed ED3 and RIS sequences", () => {
		it("should use last sequence when RIS comes after ED3", () => {
			expect(extractContentAfterClear(`a${ESC}[3Jb${ESC}cc`)).toBe("c");
		});

		it("should use last sequence when ED3 comes after RIS", () => {
			expect(extractContentAfterClear(`a${ESC}cb${ESC}[3Jc`)).toBe("c");
		});

		it("should handle complex mixed sequences", () => {
			expect(
				extractContentAfterClear(
					`first${ESC}[3Jsecond${ESC}cthird${ESC}[3Jfinal`,
				),
			).toBe("final");
		});
	});

	describe("no clear sequence", () => {
		it("should return original data when no clear sequence", () => {
			expect(extractContentAfterClear("normal text")).toBe("normal text");
		});

		it("should return original data with other escape sequences", () => {
			const data = `${ESC}[32mgreen${ESC}[0m`;
			expect(extractContentAfterClear(data)).toBe(data);
		});

		it("should return empty string for empty input", () => {
			expect(extractContentAfterClear("")).toBe("");
		});
	});

	describe("edge cases", () => {
		it("should handle unicode content after clear", () => {
			expect(extractContentAfterClear(`old${ESC}[3J日本語🎉`)).toBe("日本語🎉");
		});

		it("should handle newlines after clear", () => {
			expect(extractContentAfterClear(`old${ESC}[3J\nnew\nlines`)).toBe(
				"\nnew\nlines",
			);
		});

		it("should handle ANSI colors after clear", () => {
			const result = extractContentAfterClear(
				`old${ESC}[3J${ESC}[32mgreen${ESC}[0m`,
			);
			expect(result).toBe(`${ESC}[32mgreen${ESC}[0m`);
		});

		it("should not confuse similar sequences", () => {
			// ESC[3 (without J) is not a clear sequence
			expect(extractContentAfterClear(`${ESC}[3mtext`)).toBe(`${ESC}[3mtext`);
		});
	});
});
