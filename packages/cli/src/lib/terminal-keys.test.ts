import { describe, expect, test } from "bun:test";
import {
	encodeKeyName,
	KEY_WRITE_GAP_MS,
	KNOWN_KEY_NAMES,
	normalizeKeyName,
	planKeyWrites,
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

	test.each([
		"constructor",
		"__proto__",
		"toString",
		"hasOwnProperty",
	])("does not treat the inherited property %s as a key", (name) => {
		expect(encodeKeyName(name)).toBeUndefined();
		expect(KNOWN_KEY_NAMES).not.toContain(name);
	});
});

describe("normalizeKeyName", () => {
	test("lowercases and trims", () => {
		expect(normalizeKeyName(" Ctrl+C ")).toBe("ctrl+c");
	});
});

describe("planKeyWrites", () => {
	test("writes Escape alone and pauses before Enter, never \\x1b\\r in one write", () => {
		expect(planKeyWrites(["esc", "enter"])).toEqual({
			writes: [
				{ data: "\x1b", keys: ["esc"], gapAfterMs: KEY_WRITE_GAP_MS },
				{ data: "\r", keys: ["enter"], gapAfterMs: 0 },
			],
			unknown: [],
		});
	});

	test("a lone Ctrl+C is one write with no pause", () => {
		expect(planKeyWrites(["ctrl+c"])).toEqual({
			writes: [{ data: "\x03", keys: ["ctrl+c"], gapAfterMs: 0 }],
			unknown: [],
		});
	});

	test("a lone Escape is one write with no trailing pause", () => {
		expect(planKeyWrites(["escape"])).toEqual({
			writes: [{ data: "\x1b", keys: ["escape"], gapAfterMs: 0 }],
			unknown: [],
		});
	});

	test("keys that are complete sequences share a write", () => {
		expect(planKeyWrites(["up", "up", "enter"])).toEqual({
			writes: [
				{
					data: "\x1b[A\x1b[A\r",
					keys: ["up", "up", "enter"],
					gapAfterMs: 0,
				},
			],
			unknown: [],
		});
	});

	test("splits on both sides of an Escape in the middle", () => {
		expect(planKeyWrites(["ctrl+c", "esc", "enter"]).writes).toEqual([
			{ data: "\x03", keys: ["ctrl+c"], gapAfterMs: KEY_WRITE_GAP_MS },
			{ data: "\x1b", keys: ["esc"], gapAfterMs: KEY_WRITE_GAP_MS },
			{ data: "\r", keys: ["enter"], gapAfterMs: 0 },
		]);
	});

	test("two Escapes are two writes", () => {
		expect(planKeyWrites(["esc", "esc"]).writes).toEqual([
			{ data: "\x1b", keys: ["esc"], gapAfterMs: KEY_WRITE_GAP_MS },
			{ data: "\x1b", keys: ["esc"], gapAfterMs: 0 },
		]);
	});

	test("reports unrecognized names and plans the rest", () => {
		expect(planKeyWrites(["bogus"])).toEqual({
			writes: [],
			unknown: ["bogus"],
		});
		expect(planKeyWrites(["ctrl+c", "nope", "up", "ctrl+9"])).toEqual({
			writes: [{ data: "\x03\x1b[A", keys: ["ctrl+c", "up"], gapAfterMs: 0 }],
			unknown: ["nope", "ctrl+9"],
		});
	});

	test("an inherited property name is unknown, not a write", () => {
		expect(planKeyWrites(["constructor", "enter"])).toEqual({
			writes: [{ data: "\r", keys: ["enter"], gapAfterMs: 0 }],
			unknown: ["constructor"],
		});
	});
});
