import { describe, expect, it } from "bun:test";
import {
	canonicalizeChord,
	isIgnorableKey,
	normalizeToken,
	resolveHotkeyFromEvent,
} from "./resolveHotkeyFromEvent";

// Minimal stub — the renderer references `navigator` only at import time.
// Bun's test runtime doesn't have a DOM navigator by default; registry.ts
// detects platform via `navigator.platform` and falls back to "mac" when
// navigator is undefined. We only assert platform-agnostic behavior here.

describe("normalizeToken", () => {
	it("maps code aliases to canonical names", () => {
		expect(normalizeToken("ControlLeft")).toBe("ctrl");
		expect(normalizeToken("ControlRight")).toBe("ctrl");
		expect(normalizeToken("MetaLeft")).toBe("meta");
		expect(normalizeToken("ShiftRight")).toBe("shift");
		expect(normalizeToken("AltLeft")).toBe("alt");
		expect(normalizeToken("OSLeft")).toBe("meta");
	});

	it("strips key/digit/numpad prefixes from event.code", () => {
		expect(normalizeToken("KeyA")).toBe("a");
		expect(normalizeToken("KeyZ")).toBe("z");
		expect(normalizeToken("Digit1")).toBe("1");
		expect(normalizeToken("Digit0")).toBe("0");
		expect(normalizeToken("Numpad5")).toBe("5");
	});

	it("lowercases physical key names and keeps punctuation tokens", () => {
		expect(normalizeToken("BracketLeft")).toBe("bracketleft");
		expect(normalizeToken("BracketRight")).toBe("bracketright");
		expect(normalizeToken("Comma")).toBe("comma");
		expect(normalizeToken("Slash")).toBe("slash");
		expect(normalizeToken("Backslash")).toBe("backslash");
		expect(normalizeToken("Semicolon")).toBe("semicolon");
	});

	it("aliases short arrow names to canonical", () => {
		expect(normalizeToken("up")).toBe("arrowup");
		expect(normalizeToken("down")).toBe("arrowdown");
		expect(normalizeToken("left")).toBe("arrowleft");
		expect(normalizeToken("right")).toBe("arrowright");
		expect(normalizeToken("esc")).toBe("escape");
		expect(normalizeToken("return")).toBe("enter");
	});

	it("canonicalizes arrow event.code to the same as short form", () => {
		expect(normalizeToken("ArrowUp")).toBe("arrowup");
		expect(normalizeToken("ArrowDown")).toBe("arrowdown");
	});
});

describe("isIgnorableKey", () => {
	it("rejects empty normalized keys", () => {
		expect(isIgnorableKey("")).toBe(true);
	});

	it("rejects every modifier alias", () => {
		for (const m of ["meta", "ctrl", "control", "alt", "shift"]) {
			expect(isIgnorableKey(m)).toBe(true);
		}
	});

	it("rejects lock keys", () => {
		expect(isIgnorableKey("capslock")).toBe(true);
		expect(isIgnorableKey("numlock")).toBe(true);
		expect(isIgnorableKey("scrolllock")).toBe(true);
	});

	it("allows regular letters, digits, and punctuation", () => {
		expect(isIgnorableKey("a")).toBe(false);
		expect(isIgnorableKey("1")).toBe(false);
		expect(isIgnorableKey("bracketleft")).toBe(false);
		expect(isIgnorableKey("arrowup")).toBe(false);
	});
});

describe("canonicalizeChord", () => {
	it("sorts modifiers alphabetically and preserves the key", () => {
		expect(canonicalizeChord("meta+alt+up")).toBe("alt+meta+arrowup");
		expect(canonicalizeChord("shift+ctrl+k")).toBe("ctrl+shift+k");
	});

	it("treats `control` and `ctrl` as the same modifier", () => {
		expect(canonicalizeChord("control+k")).toBe("ctrl+k");
		expect(canonicalizeChord("Control+K")).toBe("ctrl+k");
	});

	it("normalizes key aliases across equivalent chord spellings", () => {
		expect(canonicalizeChord("meta+alt+up")).toBe(
			canonicalizeChord("alt+meta+arrowup"),
		);
		expect(canonicalizeChord("ctrl+shift+bracketleft")).toBe(
			canonicalizeChord("shift+ctrl+bracketleft"),
		);
	});

	it("is idempotent", () => {
		const once = canonicalizeChord("meta+shift+l");
		expect(canonicalizeChord(once)).toBe(once);
	});
});

interface StubInit {
	type?: string;
	code?: string;
	ctrlKey?: boolean;
	metaKey?: boolean;
	altKey?: boolean;
	shiftKey?: boolean;
}
function ev(init: StubInit): KeyboardEvent {
	return {
		type: init.type ?? "keydown",
		code: init.code ?? "",
		key: "",
		ctrlKey: !!init.ctrlKey,
		metaKey: !!init.metaKey,
		altKey: !!init.altKey,
		shiftKey: !!init.shiftKey,
	} as unknown as KeyboardEvent;
}

describe("resolveHotkeyFromEvent", () => {
	it("returns null for non-keydown events", () => {
		expect(
			resolveHotkeyFromEvent(ev({ type: "keyup", code: "KeyP", metaKey: true })),
		).toBeNull();
	});

	it("returns null for pure modifier presses", () => {
		expect(
			resolveHotkeyFromEvent(ev({ code: "ControlLeft", ctrlKey: true })),
		).toBeNull();
	});

	it("returns null for unbound chords", () => {
		expect(
			resolveHotkeyFromEvent(
				ev({
					code: "KeyZ",
					ctrlKey: true,
					shiftKey: true,
					altKey: true,
					metaKey: true,
				}),
			),
		).toBeNull();
	});
});
