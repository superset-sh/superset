import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { HOTKEYS } from "../registry";
import { useHotkeyOverridesStore } from "../stores/hotkeyOverridesStore";
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

describe("resolveHotkeyFromEvent — live override index", () => {
	let originalOverrides: Record<string, string | null>;
	beforeEach(() => {
		originalOverrides = useHotkeyOverridesStore.getState().overrides;
	});
	afterEach(() => {
		useHotkeyOverridesStore.setState({ overrides: originalOverrides });
	});

	it("resolves a default binding when no override is set", () => {
		// Pick any hotkey with a default key and construct its event.
		const firstId = Object.keys(HOTKEYS)[0] as keyof typeof HOTKEYS;
		const def = HOTKEYS[firstId].key;
		if (!def) return; // skip if the default is unset
		const event = buildEventFromChord(def);
		expect(resolveHotkeyFromEvent(event)).toBe(firstId);
	});

	it("resolves a rebound chord after an override is saved", () => {
		const id = Object.keys(HOTKEYS)[0] as keyof typeof HOTKEYS;
		useHotkeyOverridesStore.setState({
			overrides: { [id]: "meta+shift+f10" },
		});
		const event = buildEventFromChord("meta+shift+f10");
		expect(resolveHotkeyFromEvent(event)).toBe(id);
	});

	it("does NOT resolve the old default after the user rebinds away from it", () => {
		const id = Object.keys(HOTKEYS)[0] as keyof typeof HOTKEYS;
		const oldDefault = HOTKEYS[id].key;
		if (!oldDefault) return;
		useHotkeyOverridesStore.setState({
			overrides: { [id]: "meta+shift+f10" },
		});
		const event = buildEventFromChord(oldDefault);
		expect(resolveHotkeyFromEvent(event)).toBeNull();
	});

	it("does NOT resolve a hotkey the user explicitly unassigned (null override)", () => {
		const id = Object.keys(HOTKEYS)[0] as keyof typeof HOTKEYS;
		const def = HOTKEYS[id].key;
		if (!def) return;
		useHotkeyOverridesStore.setState({ overrides: { [id]: null } });
		const event = buildEventFromChord(def);
		expect(resolveHotkeyFromEvent(event)).toBeNull();
	});
});

/**
 * Turns a chord string (e.g. `meta+shift+f10`, `ctrl+bracketleft`) into a
 * KeyboardEvent stub with matching `event.code` and modifier flags.
 */
function buildEventFromChord(chord: string): KeyboardEvent {
	const parts = chord.toLowerCase().split("+");
	const mods = {
		metaKey: parts.includes("meta"),
		ctrlKey: parts.includes("ctrl") || parts.includes("control"),
		altKey: parts.includes("alt"),
		shiftKey: parts.includes("shift"),
	};
	const key = parts.find(
		(p) => !["meta", "ctrl", "control", "alt", "shift"].includes(p),
	);
	const code = chordKeyToCode(key ?? "");
	return {
		type: "keydown",
		code,
		key: "",
		...mods,
	} as unknown as KeyboardEvent;
}

// Inverse of normalizeToken for the tokens the registry uses. Only needs to
// cover what tests exercise.
function chordKeyToCode(key: string): string {
	if (/^[a-z]$/.test(key)) return `Key${key.toUpperCase()}`;
	if (/^[0-9]$/.test(key)) return `Digit${key}`;
	if (/^f([1-9]|1[0-2])$/.test(key)) return key.toUpperCase();
	switch (key) {
		case "arrowup":
		case "up":
			return "ArrowUp";
		case "arrowdown":
		case "down":
			return "ArrowDown";
		case "arrowleft":
		case "left":
			return "ArrowLeft";
		case "arrowright":
		case "right":
			return "ArrowRight";
		case "bracketleft":
			return "BracketLeft";
		case "bracketright":
			return "BracketRight";
		case "comma":
			return "Comma";
		case "slash":
			return "Slash";
		case "backslash":
			return "Backslash";
		case "backspace":
			return "Backspace";
		case "space":
			return "Space";
		case "tab":
			return "Tab";
		default:
			return key;
	}
}

describe("resolveHotkeyFromEvent", () => {
	it("returns null for non-keydown events", () => {
		expect(
			resolveHotkeyFromEvent(
				ev({ type: "keyup", code: "KeyP", metaKey: true }),
			),
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
