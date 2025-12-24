import { describe, expect, it } from "bun:test";
import {
	containsClearScrollbackSequence,
	extractContentAfterClear,
} from "./terminal-escape-filter";

const ESC = "\x1b";

describe("containsClearScrollbackSequence", () => {
	it("should detect ED3 sequence", () => {
		expect(containsClearScrollbackSequence(`${ESC}[3J`)).toBe(true);
	});

	it("should NOT detect RIS sequence (used by TUI apps for repaints)", () => {
		expect(containsClearScrollbackSequence(`${ESC}c`)).toBe(false);
	});

	it("should detect ED3 in mixed content", () => {
		expect(containsClearScrollbackSequence(`before${ESC}[3Jafter`)).toBe(true);
	});

	it("should NOT detect RIS in mixed content", () => {
		expect(containsClearScrollbackSequence(`before${ESC}cafter`)).toBe(false);
	});

	it("should return false for no clear sequence", () => {
		expect(containsClearScrollbackSequence("normal text")).toBe(false);
	});

	it("should return false for other escape sequences", () => {
		expect(containsClearScrollbackSequence(`${ESC}[2J`)).toBe(false); // Clear screen (not scrollback)
		expect(containsClearScrollbackSequence(`${ESC}[H`)).toBe(false); // Cursor home
		expect(containsClearScrollbackSequence(`${ESC}c`)).toBe(false); // RIS (used by TUI apps)
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

	describe("RIS sequence handling (should NOT clear)", () => {
		it("should NOT treat RIS as clear sequence - return original data", () => {
			expect(extractContentAfterClear(`${ESC}c`)).toBe(`${ESC}c`);
		});

		it("should preserve RIS and surrounding content", () => {
			expect(extractContentAfterClear(`${ESC}cnew content`)).toBe(
				`${ESC}cnew content`,
			);
		});

		it("should preserve content around RIS", () => {
			expect(extractContentAfterClear(`old stuff${ESC}cnew content`)).toBe(
				`old stuff${ESC}cnew content`,
			);
		});
	});

	describe("mixed ED3 and RIS sequences", () => {
		it("should only use ED3 even when RIS comes after", () => {
			// RIS is ignored, only ED3 matters
			expect(extractContentAfterClear(`a${ESC}[3Jb${ESC}cc`)).toBe(`b${ESC}cc`);
		});

		it("should use ED3 and preserve RIS before it", () => {
			expect(extractContentAfterClear(`a${ESC}cb${ESC}[3Jc`)).toBe("c");
		});

		it("should handle multiple ED3 sequences - use last one", () => {
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
