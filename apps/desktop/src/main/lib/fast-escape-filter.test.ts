import { describe, expect, it } from "bun:test";
import { FastEscapeFilter } from "./fast-escape-filter";

const ESC = "\x1b";
const BEL = "\x07";

describe("FastEscapeFilter", () => {
	describe("Cursor Position Report (CPR)", () => {
		it("should filter ESC[row;colR", () => {
			const filter = new FastEscapeFilter();
			expect(filter.filter(`hello${ESC}[24;1Rworld`)).toBe("helloworld");
		});

		it("should filter ESC[rowR (single number)", () => {
			const filter = new FastEscapeFilter();
			expect(filter.filter(`hello${ESC}[2Rworld`)).toBe("helloworld");
		});

		it("should filter multiple CPRs", () => {
			const filter = new FastEscapeFilter();
			expect(filter.filter(`a${ESC}[1;1Rb${ESC}[99;99Rc`)).toBe("abc");
		});
	});

	describe("Primary Device Attributes (DA1)", () => {
		it("should filter ESC[?...c", () => {
			const filter = new FastEscapeFilter();
			expect(filter.filter(`hello${ESC}[?1;0cworld`)).toBe("helloworld");
		});

		it("should filter ESC[?c (minimal)", () => {
			const filter = new FastEscapeFilter();
			expect(filter.filter(`hello${ESC}[?cworld`)).toBe("helloworld");
		});
	});

	describe("Secondary Device Attributes (DA2)", () => {
		it("should filter ESC[>...c", () => {
			const filter = new FastEscapeFilter();
			expect(filter.filter(`hello${ESC}[>0;276;0cworld`)).toBe("helloworld");
		});
	});

	describe("Device Attributes (no prefix)", () => {
		it("should filter ESC[digits;...c", () => {
			const filter = new FastEscapeFilter();
			expect(filter.filter(`hello${ESC}[0;276;0cworld`)).toBe("helloworld");
		});
	});

	describe("Mode Reports", () => {
		it("should filter ESC[?...;...$y (DECRPM)", () => {
			const filter = new FastEscapeFilter();
			expect(filter.filter(`hello${ESC}[?1;2$yworld`)).toBe("helloworld");
		});

		it("should filter ESC[...;...$y (standard mode)", () => {
			const filter = new FastEscapeFilter();
			expect(filter.filter(`hello${ESC}[12;2$yworld`)).toBe("helloworld");
		});
	});

	describe("OSC Color Responses", () => {
		it("should filter OSC 10 with BEL terminator", () => {
			const filter = new FastEscapeFilter();
			expect(filter.filter(`hello${ESC}]10;rgb:ff/ff/ff${BEL}world`)).toBe(
				"helloworld",
			);
		});

		it("should filter OSC 11 with ST terminator", () => {
			const filter = new FastEscapeFilter();
			expect(filter.filter(`hello${ESC}]11;rgb:00/00/00${ESC}\\world`)).toBe(
				"helloworld",
			);
		});

		it("should filter OSC 19", () => {
			const filter = new FastEscapeFilter();
			expect(filter.filter(`hello${ESC}]19;rgb:ab/cd/ef${BEL}world`)).toBe(
				"helloworld",
			);
		});
	});

	describe("DCS Sequences", () => {
		it("should filter DA3 (ESC P ! | ... ESC \\)", () => {
			const filter = new FastEscapeFilter();
			expect(filter.filter(`hello${ESC}P!|test${ESC}\\world`)).toBe(
				"helloworld",
			);
		});

		it("should filter XTVERSION (ESC P > | ... ESC \\)", () => {
			const filter = new FastEscapeFilter();
			expect(filter.filter(`hello${ESC}P>|xterm(123)${ESC}\\world`)).toBe(
				"helloworld",
			);
		});
	});

	describe("Unknown CSI", () => {
		it("should filter ESC[O", () => {
			const filter = new FastEscapeFilter();
			expect(filter.filter(`hello${ESC}[Oworld`)).toBe("helloworld");
		});
	});

	describe("Preserves normal sequences", () => {
		it("should preserve color codes", () => {
			const filter = new FastEscapeFilter();
			const colored = `${ESC}[32mgreen${ESC}[0m`;
			expect(filter.filter(colored)).toBe(colored);
		});

		it("should preserve cursor movement", () => {
			const filter = new FastEscapeFilter();
			const cursor = `${ESC}[H${ESC}[2J`;
			expect(filter.filter(cursor)).toBe(cursor);
		});

		it("should preserve clear scrollback (ESC[3J)", () => {
			const filter = new FastEscapeFilter();
			const clear = `${ESC}[3J`;
			expect(filter.filter(clear)).toBe(clear);
		});

		it("should preserve reset (ESC c)", () => {
			const filter = new FastEscapeFilter();
			const reset = `${ESC}c`;
			expect(filter.filter(reset)).toBe(reset);
		});
	});

	describe("Chunked sequences", () => {
		it("should handle CPR split across chunks", () => {
			const filter = new FastEscapeFilter();
			const result1 = filter.filter(`hello${ESC}[24`);
			const result2 = filter.filter(";1Rworld");
			expect(result1 + result2).toBe("helloworld");
		});

		it("should handle DA1 split across chunks", () => {
			const filter = new FastEscapeFilter();
			const result1 = filter.filter(`hello${ESC}[?1;`);
			const result2 = filter.filter("0cworld");
			expect(result1 + result2).toBe("helloworld");
		});
	});

	describe("flush", () => {
		it("should return buffered incomplete sequence", () => {
			const filter = new FastEscapeFilter();
			filter.filter(`hello${ESC}[24`);
			expect(filter.flush()).toBe(`${ESC}[24`);
		});

		it("should return empty string when no buffered data", () => {
			const filter = new FastEscapeFilter();
			filter.filter("hello");
			expect(filter.flush()).toBe("");
		});
	});

	describe("plain text passthrough", () => {
		it("should pass through plain text unchanged", () => {
			const filter = new FastEscapeFilter();
			expect(filter.filter("hello world")).toBe("hello world");
		});

		it("should handle empty string", () => {
			const filter = new FastEscapeFilter();
			expect(filter.filter("")).toBe("");
		});

		it("should handle large plain text", () => {
			const filter = new FastEscapeFilter();
			const large = "x".repeat(100000);
			expect(filter.filter(large)).toBe(large);
		});
	});
});
