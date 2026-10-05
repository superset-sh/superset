import { describe, expect, test } from "bun:test";
import { revealEnd } from "./revealEnd";

describe("revealEnd", () => {
	test("runs to the end of the word the position falls in", () => {
		expect(revealEnd("hello world again", 2, true)).toBe(5);
		expect(revealEnd("hello world again", 7, true)).toBe(11);
	});

	test("holds back a partial last word while streaming", () => {
		expect(revealEnd("hello wor", 7, true)).toBe(6);
	});

	test("shows everything once the stream has ended", () => {
		expect(revealEnd("hello wor", 7, false)).toBe(9);
	});

	test("cuts between characters of a script written without spaces", () => {
		expect(revealEnd("你好世界", 1.2, true)).toBe(2);
		expect(revealEnd("こんにちは", 5, true)).toBe(5);
	});

	test("keeps a mark with its letter and a surrogate pair whole", () => {
		expect(revealEnd("กินข้าว", 1, true)).toBe(2);
		expect(revealEnd("𠀀𠀁𠀂", 1, true)).toBe(2);
	});

	test("shows a held word once it grows past the hold limit", () => {
		const token = `see https://example.com/${"a".repeat(40)}`;
		expect(revealEnd(token, token.length, true)).toBe(token.length);
	});
});
