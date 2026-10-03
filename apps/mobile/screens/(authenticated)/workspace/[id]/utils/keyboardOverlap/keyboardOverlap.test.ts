import { describe, expect, test } from "bun:test";
import { keyboardOverlap } from "./keyboardOverlap";

const SCREEN = 1366;

describe("keyboardOverlap", () => {
	test("a docked keyboard covers its own height", () => {
		expect(
			keyboardOverlap({ screenY: SCREEN - 400, height: 400 }, SCREEN),
		).toBe(400);
	});

	test("a floating keyboard covers nothing at the bottom", () => {
		expect(keyboardOverlap({ screenY: 600, height: 260 }, SCREEN)).toBe(0);
	});

	test("the hardware-keyboard shortcut bar covers only its strip", () => {
		expect(keyboardOverlap({ screenY: SCREEN - 55, height: 55 }, SCREEN)).toBe(
			55,
		);
	});

	test("a keyboard sliding off the bottom covers nothing", () => {
		expect(keyboardOverlap({ screenY: SCREEN, height: 400 }, SCREEN)).toBe(0);
	});
});
