import { describe, expect, it } from "bun:test";
import {
	canonicalizeChord,
	chordFromInput,
	eventToChord,
	type KeyChordInput,
} from "./hotkey-chord";

// Plain-object stub cast to KeyboardEvent — Bun's test runtime has no DOM
// KeyboardEvent constructor (mirrors resolveHotkeyFromEvent.test.ts).
function ev(init: {
	code: string;
	metaKey?: boolean;
	ctrlKey?: boolean;
	altKey?: boolean;
	shiftKey?: boolean;
	altGraph?: boolean;
}): KeyboardEvent {
	return {
		type: "keydown",
		code: init.code,
		key: "",
		metaKey: !!init.metaKey,
		ctrlKey: !!init.ctrlKey,
		altKey: !!init.altKey,
		shiftKey: !!init.shiftKey,
		isComposing: false,
		keyCode: 0,
		getModifierState: (mod: string) =>
			mod === "AltGraph" ? !!init.altGraph : false,
	} as unknown as KeyboardEvent;
}

function input(
	partial: Partial<KeyChordInput> & { code: string },
): KeyChordInput {
	return {
		meta: false,
		control: false,
		alt: false,
		shift: false,
		...partial,
	};
}

describe("canonicalizeChord", () => {
	it("resolves physical modifier codes regardless of case", () => {
		expect(canonicalizeChord("MetaLeft+KeyK")).toBe("meta+k");
		expect(canonicalizeChord("metaleft+k")).toBe("meta+k");
	});

	it("resolves word aliases regardless of case", () => {
		expect(canonicalizeChord("ctrl+Return")).toBe("ctrl+enter");
		expect(canonicalizeChord("CTRL+ESC")).toBe("ctrl+escape");
	});
});

describe("chordFromInput", () => {
	it("canonicalizes modifiers regardless of press order", () => {
		expect(chordFromInput(input({ code: "BracketLeft", control: true }))).toBe(
			"ctrl+bracketleft",
		);
		expect(
			chordFromInput(input({ code: "Digit1", meta: true, shift: true })),
		).toBe("meta+shift+1");
	});

	it("returns null for pure modifier / lock keys", () => {
		expect(
			chordFromInput(input({ code: "ControlLeft", control: true })),
		).toBeNull();
		expect(chordFromInput(input({ code: "CapsLock" }))).toBeNull();
		expect(chordFromInput(input({ code: "" }))).toBeNull();
	});

	it("matches a chord the renderer registers via canonicalizeChord", () => {
		// The renderer registers code-based dispatch chords, then canonicalizes.
		expect(chordFromInput(input({ code: "BracketRight", meta: true }))).toBe(
			canonicalizeChord("meta+BracketRight"),
		);
	});
});

// The renderer registers forwardable chords from DOM events (eventToChord) and
// the main process matches guest keystrokes against them (chordFromInput). If
// the two canonicalize the same physical key differently, forwarding silently
// misses — so pin that they agree for the shared (guard-free) input space.
describe("eventToChord ≡ chordFromInput", () => {
	const cases: Array<{
		code: string;
		meta?: boolean;
		ctrl?: boolean;
		alt?: boolean;
		shift?: boolean;
	}> = [
		{ code: "BracketLeft", ctrl: true },
		{ code: "BracketRight", meta: true },
		{ code: "Digit1", meta: true },
		{ code: "Digit9", ctrl: true, shift: true },
		{ code: "KeyE", ctrl: true, alt: true },
		{ code: "Tab", ctrl: true },
		{ code: "ControlLeft", ctrl: true },
		{ code: "CapsLock" },
	];

	for (const c of cases) {
		it(`agrees for ${JSON.stringify(c)}`, () => {
			const domChord = eventToChord(
				ev({
					code: c.code,
					metaKey: c.meta,
					ctrlKey: c.ctrl,
					altKey: c.alt,
					shiftKey: c.shift,
				}),
			);
			const mainChord = chordFromInput(
				input({
					code: c.code,
					meta: c.meta ?? false,
					control: c.ctrl ?? false,
					alt: c.alt ?? false,
					shift: c.shift ?? false,
				}),
			);
			expect(mainChord).toBe(domChord);
		});
	}
});
