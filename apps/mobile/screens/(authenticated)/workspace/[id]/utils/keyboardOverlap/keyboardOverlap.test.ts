import { describe, expect, test } from "bun:test";
import { keyboardOverlap } from "./keyboardOverlap";

const WINDOW = 1366;

describe("keyboardOverlap", () => {
	test("a docked keyboard covers its own height", () => {
		expect(
			keyboardOverlap({ screenY: WINDOW - 400, height: 400 }, WINDOW),
		).toBe(400);
	});

	test("a floating keyboard covers nothing at the bottom", () => {
		expect(keyboardOverlap({ screenY: 600, height: 260 }, WINDOW)).toBe(0);
	});

	test("the hardware-keyboard shortcut bar covers only its strip", () => {
		expect(keyboardOverlap({ screenY: WINDOW - 55, height: 55 }, WINDOW)).toBe(
			55,
		);
	});

	test("a keyboard sliding off the bottom covers nothing", () => {
		expect(keyboardOverlap({ screenY: WINDOW, height: 400 }, WINDOW)).toBe(0);
	});

	test("a keyboard running past a short window covers only the part inside it", () => {
		// Stage Manager window 900pt tall; the docked keyboard's top is 300pt
		// above its bottom and the rest hangs below it.
		expect(keyboardOverlap({ screenY: 600, height: 400 }, 900)).toBe(300);
	});

	test("a keyboard ending exactly 1pt short of the bottom still counts as docked", () => {
		expect(
			keyboardOverlap({ screenY: WINDOW - 401, height: 400 }, WINDOW),
		).toBe(400);
	});

	test("a keyboard ending more than 1pt short of the bottom is floating", () => {
		expect(
			keyboardOverlap({ screenY: WINDOW - 401.01, height: 400 }, WINDOW),
		).toBe(0);
	});
});
