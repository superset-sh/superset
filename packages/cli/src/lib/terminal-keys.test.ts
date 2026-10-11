import { describe, expect, test } from "bun:test";
import { parseTerminalKeys } from "./terminal-keys";

describe("parseTerminalKeys", () => {
	test("maps named keys and ctrl chords to their bytes, in order", () => {
		expect(parseTerminalKeys("Esc, ctrl+c,up,enter,shift+tab")).toEqual([
			"\x1b",
			"\x03",
			"\x1b[A",
			"\r",
			"\x1b[Z",
		]);
	});

	test("accepts single characters, C- aliases, alt chords and function keys", () => {
		expect(parseTerminalKeys("y,Y,C-c,alt+b,f5")).toEqual([
			"y",
			"Y",
			"\x03",
			"\x1bb",
			"\x1b[15~",
		]);
	});

	test("rejects an unknown key name", () => {
		expect(() => parseTerminalKeys("esc,hyper+x")).toThrow(
			"Unknown key: hyper+x",
		);
		expect(() => parseTerminalKeys("enter,constructor")).toThrow(
			"Unknown key: constructor",
		);
	});
});
