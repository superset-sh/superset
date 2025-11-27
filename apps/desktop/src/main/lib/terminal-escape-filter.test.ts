import { describe, expect, it } from "bun:test";
import { filterTerminalQueryResponses } from "./terminal-escape-filter";

// Control characters for building test sequences
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
