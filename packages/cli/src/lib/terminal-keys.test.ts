import { describe, expect, test } from "bun:test";
import {
	encodeKeyName,
	encodeKeys,
	KNOWN_KEY_NAMES,
	normalizeKeyName,
} from "./terminal-keys";

describe("encodeKeyName", () => {
	test.each([
		["enter", "\r"],
		["return", "\r"],
		["esc", "\x1b"],
		["escape", "\x1b"],
		["tab", "\t"],
		["backspace", "\x7f"],
		["space", " "],
		["up", "\x1b[A"],
		["down", "\x1b[B"],
		["right", "\x1b[C"],
		["left", "\x1b[D"],
		["home", "\x1b[H"],
		["end", "\x1b[F"],
		["pageup", "\x1b[5~"],
		["pagedown", "\x1b[6~"],
		["delete", "\x1b[3~"],
	])("encodes %s", (name, expected) => {
		expect(encodeKeyName(name)).toBe(expected);
	});

	test("every KNOWN_KEY_NAMES entry encodes", () => {
		for (const name of KNOWN_KEY_NAMES) {
			expect(encodeKeyName(name)).toBeDefined();
		}
	});

	test.each([
		["ctrl+a", "\x01"],
		["ctrl+c", "\x03"],
		["ctrl+d", "\x04"],
		["ctrl+z", "\x1a"],
	])("derives %s from the letter", (name, expected) => {
		expect(encodeKeyName(name)).toBe(expected);
	});

	test("is case-insensitive and trims whitespace", () => {
		expect(encodeKeyName("Esc")).toBe("\x1b");
		expect(encodeKeyName("CTRL+C")).toBe("\x03");
		expect(encodeKeyName("  Enter ")).toBe("\r");
	});

	test.each([
		"ctrl+",
		"ctrl+1",
		"ctrl+ab",
		"ctrl+-",
		"ctrl+shift+c",
		"f1",
		"hello",
		"",
	])("rejects %j", (name) => {
		expect(encodeKeyName(name)).toBeUndefined();
	});
});

describe("normalizeKeyName", () => {
	test("lowercases and trims", () => {
		expect(normalizeKeyName(" Ctrl+C ")).toBe("ctrl+c");
	});
});

describe("encodeKeys", () => {
	test("concatenates recognized keys in order", () => {
		expect(encodeKeys(["esc", "enter"])).toEqual({
			bytes: "\x1b\r",
			unknown: [],
		});
	});

	test("reports unrecognized names", () => {
		expect(encodeKeys(["bogus"])).toEqual({ bytes: "", unknown: ["bogus"] });
	});

	test("encodes the valid names while collecting the invalid ones", () => {
		expect(encodeKeys(["ctrl+c", "nope", "up", "ctrl+9"])).toEqual({
			bytes: "\x03\x1b[A",
			unknown: ["nope", "ctrl+9"],
		});
	});
});
