import { describe, expect, it } from "bun:test";
import { stripClearScrollbackSequence } from "./terminal-escape";

const ESC = "\x1b";

describe("stripClearScrollbackSequence", () => {
	it("should strip ED3 sequence", () => {
		expect(stripClearScrollbackSequence(`${ESC}[3J`)).toBe("");
	});

	it("should strip ED3 from middle of content", () => {
		expect(stripClearScrollbackSequence(`before${ESC}[3Jafter`)).toBe(
			"beforeafter",
		);
	});

	it("should strip multiple ED3 sequences", () => {
		expect(stripClearScrollbackSequence(`a${ESC}[3Jb${ESC}[3Jc`)).toBe("abc");
	});

	it("should preserve ESC[2J (clear screen)", () => {
		expect(stripClearScrollbackSequence(`${ESC}[2J`)).toBe(`${ESC}[2J`);
	});

	it("should preserve ESC[2J while stripping ESC[3J", () => {
		expect(stripClearScrollbackSequence(`${ESC}[2J${ESC}[3J`)).toBe(
			`${ESC}[2J`,
		);
	});

	it("should preserve RIS (ESC c)", () => {
		expect(stripClearScrollbackSequence(`${ESC}c`)).toBe(`${ESC}c`);
	});

	it("should return original data when no ED3 sequence", () => {
		expect(stripClearScrollbackSequence("normal text")).toBe("normal text");
	});

	it("should return empty string for empty input", () => {
		expect(stripClearScrollbackSequence("")).toBe("");
	});

	it("should preserve ANSI colors", () => {
		const data = `${ESC}[32mgreen${ESC}[0m`;
		expect(stripClearScrollbackSequence(data)).toBe(data);
	});

	it("should not confuse similar sequences", () => {
		expect(stripClearScrollbackSequence(`${ESC}[3mtext`)).toBe(`${ESC}[3mtext`);
	});

	it("should handle unicode content", () => {
		expect(stripClearScrollbackSequence(`日本語${ESC}[3J🎉`)).toBe("日本語🎉");
	});

	it("should handle newlines", () => {
		expect(stripClearScrollbackSequence(`line1\n${ESC}[3Jline2`)).toBe(
			"line1\nline2",
		);
	});
});
