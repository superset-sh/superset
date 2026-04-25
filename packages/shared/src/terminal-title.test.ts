import { describe, expect, it } from "bun:test";
import { normalizeTerminalTitle, parseConEmuOsc9Title } from "./terminal-title";

describe("normalizeTerminalTitle", () => {
	it("normalizes empty and missing titles to null", () => {
		expect(normalizeTerminalTitle(null)).toBeNull();
		expect(normalizeTerminalTitle(undefined)).toBeNull();
		expect(normalizeTerminalTitle(" \n\t ")).toBeNull();
	});

	it("collapses control characters and caps title length", () => {
		const longTitle = `${"a".repeat(130)}\n\tb`;

		expect(normalizeTerminalTitle(longTitle)).toBe("a".repeat(120));
	});

	it("truncates without splitting surrogate pairs", () => {
		const title = `${"a".repeat(119)}😀extra`;

		expect(normalizeTerminalTitle(title)).toBe(`${"a".repeat(119)}😀`);
	});
});

describe("parseConEmuOsc9Title", () => {
	it("parses ConEmu tab title updates", () => {
		expect(parseConEmuOsc9Title("3;foo bar")).toBe("foo bar");
	});

	it("parses ConEmu tab title reset", () => {
		expect(parseConEmuOsc9Title("3;")).toBeNull();
	});

	it("ignores non-title OSC 9 payloads", () => {
		expect(parseConEmuOsc9Title("3")).toBeUndefined();
		expect(parseConEmuOsc9Title("3a")).toBeUndefined();
		expect(parseConEmuOsc9Title("4;1;50")).toBeUndefined();
	});
});
