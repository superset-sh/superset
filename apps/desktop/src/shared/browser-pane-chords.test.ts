import { describe, expect, test } from "bun:test";
import {
	canonicalizeChord,
	chordToEventInit,
	inputToChord,
	matchAppChord,
	normalizeToken,
	tokenToCode,
} from "./browser-pane-chords";

const CHORDS = new Set(
	[
		"meta+b",
		"meta+l",
		"meta+w",
		"meta+shift+k",
		"meta+alt+arrowleft",
		// registered chords that collide with guest-owned shortcuts — exclusion
		// must take priority over the index
		"meta+f",
		"meta+p",
		"meta+g",
	].map(canonicalizeChord),
);

describe("inputToChord", () => {
	test("matches ⌘B by physical position", () => {
		expect(inputToChord({ type: "keyDown", code: "KeyB", meta: true })).toBe(
			"meta+b",
		);
	});

	test("anchors to physical position, not produced character (Dvorak ⌘W)", () => {
		// Dvorak: physical KeyW prints ","
		expect(
			inputToChord({ type: "keyDown", code: "KeyW", key: ",", meta: true }),
		).toBe("meta+w");
	});

	test("includes shift and alt modifiers", () => {
		expect(
			inputToChord({
				type: "keyDown",
				code: "KeyK",
				meta: true,
				shift: true,
			}),
		).toBe("meta+shift+k");
		expect(
			inputToChord({
				type: "keyDown",
				code: "ArrowLeft",
				meta: true,
				alt: true,
			}),
		).toBe("alt+meta+arrowleft");
	});

	test("returns null for modifier-only presses", () => {
		expect(
			inputToChord({ type: "keyDown", code: "MetaLeft", meta: true }),
		).toBeNull();
	});

	test("returns null for IME composition keydowns", () => {
		expect(
			inputToChord({
				type: "keyDown",
				code: "KeyB",
				meta: true,
				isComposing: true,
			}),
		).toBeNull();
	});

	test("returns null for non-keyDown types", () => {
		expect(
			inputToChord({ type: "keyUp", code: "KeyB", meta: true }),
		).toBeNull();
	});
});

describe("matchAppChord", () => {
	test("matches a registered chord", () => {
		expect(
			matchAppChord({ type: "keyDown", code: "KeyB", meta: true }, CHORDS),
		).toBe("meta+b");
	});

	test("returns null for unregistered chords", () => {
		expect(
			matchAppChord({ type: "keyDown", code: "KeyX", meta: true }, CHORDS),
		).toBeNull();
	});

	test("exclusion wins over a registered chord (⌘F find)", () => {
		expect(
			matchAppChord({ type: "keyDown", code: "KeyF", meta: true }, CHORDS),
		).toBeNull();
	});

	test("exclusion wins over a registered chord (⌘P print)", () => {
		expect(
			matchAppChord({ type: "keyDown", code: "KeyP", meta: true }, CHORDS),
		).toBeNull();
	});

	test("exclusion wins over a registered chord (⌘G find-next)", () => {
		expect(
			matchAppChord({ type: "keyDown", code: "KeyG", meta: true }, CHORDS),
		).toBeNull();
	});

	test("guest editing shortcuts stay with the page (⌘C/⌘V/⌘X/⌘A/⌘Z + ctrl variants)", () => {
		for (const [code, mod] of [
			["KeyC", "meta"],
			["KeyV", "meta"],
			["KeyX", "meta"],
			["KeyA", "meta"],
			["KeyZ", "meta"],
			["KeyC", "control"],
			["KeyV", "control"],
			["KeyX", "control"],
			["KeyA", "control"],
			["KeyZ", "control"],
		] as const) {
			expect(
				matchAppChord(
					{ type: "keyDown", code, [mod]: true },
					new Set([canonicalizeChord(`${mod}+${code[3].toLowerCase()}`)]),
				),
			).toBeNull();
		}
	});

	test("guest undo stays with the page on non-QWERTY layouts (logical key match)", () => {
		// AZERTY: physical KeyW produces "z" (undo is ⌘Z logically), which
		// collides with the app's CLOSE_PANE (meta+w) chord — the produced
		// character must win so undo reaches the page.
		expect(
			matchAppChord(
				{
					type: "keyDown",
					code: "KeyW",
					key: "z",
					meta: true,
				},
				new Set([canonicalizeChord("meta+w")]),
			),
		).toBeNull();
	});

	test("shift-gated chords are not guest editing shortcuts (⌘⇧C COPY_PATH)", () => {
		// The guest's copy is plain ⌘C; ⌘⇧C is the app's COPY_PATH and must
		// keep forwarding even though the produced character is "c".
		expect(
			matchAppChord(
				{
					type: "keyDown",
					code: "KeyC",
					key: "C",
					meta: true,
					shift: true,
				},
				new Set([canonicalizeChord("meta+shift+c")]),
			),
		).toBe("meta+shift+c");
	});

	test("empty chord index never matches", () => {
		expect(
			matchAppChord({ type: "keyDown", code: "KeyB", meta: true }, new Set()),
		).toBeNull();
	});
});

describe("tokenToCode / chordToEventInit", () => {
	test("tokenToCode round-trips letters, digits, named keys, F-keys", () => {
		expect(tokenToCode("b")).toBe("KeyB");
		expect(tokenToCode("1")).toBe("Digit1");
		expect(tokenToCode("arrowleft")).toBe("ArrowLeft");
		expect(tokenToCode("f5")).toBe("F5");
		expect(tokenToCode("space")).toBe("Space");
	});

	test("chordToEventInit produces a re-dispatchable keydown init", () => {
		const init = chordToEventInit("meta+b");
		expect(init).not.toBeNull();
		expect(init?.code).toBe("KeyB");
		expect(init?.metaKey).toBeTrue();
		expect(init?.bubbles).toBeTrue();
	});

	test("chordToEventInit maps modifiers from the canonical chord", () => {
		const init = chordToEventInit("meta+shift+k");
		expect(init?.code).toBe("KeyK");
		expect(init?.metaKey).toBeTrue();
		expect(init?.shiftKey).toBeTrue();
		expect(init?.ctrlKey).toBeFalse();
	});

	test("chordToEventInit tolerates alias modifier order", () => {
		const init = chordToEventInit("alt+meta+arrowleft");
		expect(init?.code).toBe("ArrowLeft");
		expect(init?.metaKey).toBeTrue();
		expect(init?.altKey).toBeTrue();
	});

	test("chordToEventInit returns null for modifier-only chords", () => {
		expect(chordToEventInit("meta+shift")).toBeNull();
	});

	test("normalizeToken matches the renderer alias table", () => {
		expect(normalizeToken("KeyB")).toBe("b");
		expect(normalizeToken("Digit3")).toBe("3");
		expect(normalizeToken("ControlLeft")).toBe("ctrl");
	});
});
