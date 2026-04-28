import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { HOTKEYS, type HotkeyId } from "../registry";
import { useHotkeyOverridesStore } from "../stores/hotkeyOverridesStore";
import type { HotkeyDefinition, ShortcutBinding } from "../types";
import {
	canonicalizeChord,
	eventToChord,
	isIgnorableKey,
	isTerminalReservedEvent,
	matchesChord,
	normalizeToken,
	resolveHotkeyFromEvent,
	TERMINAL_RESERVED_CHORDS,
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

	// Regression: OS_RESERVED had `ctrl+alt+delete` written non-canonical, which
	// meant the "Reserved by OS" warning never fired for that chord. Fix wraps
	// the table in `.map(canonicalizeChord)`. Assert the canonical form here so
	// future additions can't silently break the warning the same way.
	it("sorts all modifiers alphabetically (ctrl+alt+delete → alt+ctrl+delete)", () => {
		expect(canonicalizeChord("ctrl+alt+delete")).toBe("alt+ctrl+delete");
	});
});

interface StubInit {
	type?: string;
	code?: string;
	ctrlKey?: boolean;
	metaKey?: boolean;
	altKey?: boolean;
	shiftKey?: boolean;
	altGraph?: boolean;
	isComposing?: boolean;
	keyCode?: number;
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
		isComposing: !!init.isComposing,
		keyCode: init.keyCode ?? 0,
		getModifierState: (mod: string) =>
			mod === "AltGraph" ? !!init.altGraph : false,
	} as unknown as KeyboardEvent;
}

describe("resolveHotkeyFromEvent — live override index", () => {
	let originalOverrides: Record<string, ShortcutBinding | null>;
	beforeEach(() => {
		originalOverrides = useHotkeyOverridesStore.getState().overrides;
	});
	afterEach(() => {
		useHotkeyOverridesStore.setState({ overrides: originalOverrides });
	});

	// Resolve once so registry reorders / removals surface as a test failure
	// here instead of silently skipping the cases below. The type predicate
	// narrows to a HotkeyDefinition whose .key is guaranteed non-null after
	// the filter, so sampleDef.key can be passed to string-only helpers below.
	const sampleEntry = Object.entries(HOTKEYS).find(
		(entry): entry is [HotkeyId, HotkeyDefinition & { key: string }] =>
			entry[1].key !== null,
	);
	if (!sampleEntry) throw new Error("HOTKEYS has no bound default");
	const [sampleId, sampleDef] = sampleEntry;

	it("resolves a default binding when no override is set", () => {
		const event = buildEventFromChord(sampleDef.key);
		expect(resolveHotkeyFromEvent(event)).toBe(sampleId);
	});

	it("resolves a rebound chord after an override is saved", () => {
		useHotkeyOverridesStore.setState({
			overrides: { [sampleId]: "meta+shift+f10" },
		});
		const event = buildEventFromChord("meta+shift+f10");
		expect(resolveHotkeyFromEvent(event)).toBe(sampleId);
	});

	it("does NOT resolve the old default after the user rebinds away from it", () => {
		useHotkeyOverridesStore.setState({
			overrides: { [sampleId]: "meta+shift+f10" },
		});
		const event = buildEventFromChord(sampleDef.key);
		expect(resolveHotkeyFromEvent(event)).toBeNull();
	});

	it("does NOT resolve a hotkey the user explicitly unassigned (null override)", () => {
		useHotkeyOverridesStore.setState({
			overrides: { [sampleId]: null },
		});
		const event = buildEventFromChord(sampleDef.key);
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

describe("eventToChord", () => {
	it("normalizes punctuation via event.code", () => {
		expect(eventToChord(ev({ code: "BracketLeft", ctrlKey: true }))).toBe(
			"ctrl+bracketleft",
		);
		expect(eventToChord(ev({ code: "Slash", metaKey: true }))).toBe(
			"meta+slash",
		);
	});

	it("returns null for pure modifiers and lock keys", () => {
		expect(eventToChord(ev({ code: "ControlLeft", ctrlKey: true }))).toBeNull();
		expect(eventToChord(ev({ code: "CapsLock" }))).toBeNull();
	});

	// AltGr on Linux/Windows is reported as ctrlKey+altKey. Without the guard,
	// AltGr+E on a German layout (which produces €) would match a US
	// `ctrl+alt+e` binding. Suppress both when AltGraph is set so AltGr-typed
	// printables can never trigger Ctrl+Alt hotkeys.
	it("suppresses ctrl/alt when AltGraph modifier is held", () => {
		expect(
			eventToChord(
				ev({
					code: "KeyE",
					ctrlKey: true,
					altKey: true,
					altGraph: true,
				}),
			),
		).toBe("e");
	});

	it("AltGr+letter does not match a real ctrl+alt binding", () => {
		const altGrEvent = ev({
			code: "KeyE",
			ctrlKey: true,
			altKey: true,
			altGraph: true,
		});
		expect(matchesChord(altGrEvent, "ctrl+alt+e")).toBe(false);
	});

	it("real Ctrl+Alt (no AltGraph) still matches", () => {
		const realCtrlAlt = ev({
			code: "KeyE",
			ctrlKey: true,
			altKey: true,
			altGraph: false,
		});
		expect(matchesChord(realCtrlAlt, "ctrl+alt+e")).toBe(true);
	});

	// IME composition: keydown during dead-key / CJK composition must not fire
	// hotkeys. Safari uses keyCode 229 in lieu of isComposing.
	it("returns null during IME composition (isComposing)", () => {
		expect(
			eventToChord(ev({ code: "KeyA", metaKey: true, isComposing: true })),
		).toBeNull();
	});

	it("returns null when keyCode is 229 (Safari IME)", () => {
		expect(
			eventToChord(ev({ code: "KeyA", metaKey: true, keyCode: 229 })),
		).toBeNull();
	});
});

describe("matchesChord", () => {
	it("matches events regardless of modifier order in the chord string", () => {
		const event = ev({ code: "KeyK", ctrlKey: true, shiftKey: true });
		expect(matchesChord(event, "ctrl+shift+k")).toBe(true);
		expect(matchesChord(event, "shift+ctrl+k")).toBe(true);
	});

	it("matches short vs canonical arrow forms", () => {
		const event = ev({ code: "ArrowUp", metaKey: true, altKey: true });
		expect(matchesChord(event, "meta+alt+up")).toBe(true);
		expect(matchesChord(event, "alt+meta+arrowup")).toBe(true);
	});

	it("matches punctuation rebinds via event.code (bracket, backslash)", () => {
		expect(
			matchesChord(
				ev({ code: "BracketLeft", ctrlKey: true, shiftKey: true }),
				"ctrl+shift+bracketleft",
			),
		).toBe(true);
		expect(
			matchesChord(ev({ code: "Backslash", ctrlKey: true }), "ctrl+backslash"),
		).toBe(true);
	});

	it("does NOT match when key differs", () => {
		expect(matchesChord(ev({ code: "KeyK", ctrlKey: true }), "ctrl+j")).toBe(
			false,
		);
	});

	it("does NOT match when modifiers differ", () => {
		expect(matchesChord(ev({ code: "KeyK", ctrlKey: true }), "meta+k")).toBe(
			false,
		);
	});

	it("does NOT match a bare modifier press", () => {
		expect(
			matchesChord(ev({ code: "ControlLeft", ctrlKey: true }), "ctrl+k"),
		).toBe(false);
	});
});

describe("isTerminalReservedEvent", () => {
	it.each([
		"ctrl+c",
		"ctrl+d",
		"ctrl+z",
		"ctrl+s",
		"ctrl+q",
		"ctrl+backslash",
	])("detects %s", (chord) => {
		const codeMap: Record<string, string> = {
			"ctrl+c": "KeyC",
			"ctrl+d": "KeyD",
			"ctrl+z": "KeyZ",
			"ctrl+s": "KeyS",
			"ctrl+q": "KeyQ",
			"ctrl+backslash": "Backslash",
		};
		expect(
			isTerminalReservedEvent(ev({ code: codeMap[chord], ctrlKey: true })),
		).toBe(true);
	});

	it("ignores non-reserved ctrl chords", () => {
		expect(isTerminalReservedEvent(ev({ code: "KeyK", ctrlKey: true }))).toBe(
			false,
		);
	});

	it("ignores reserved letter when extra modifier is held", () => {
		expect(
			isTerminalReservedEvent(
				ev({ code: "KeyC", ctrlKey: true, shiftKey: true }),
			),
		).toBe(false);
	});

	it("TERMINAL_RESERVED_CHORDS stays in canonical form", () => {
		for (const chord of TERMINAL_RESERVED_CHORDS) {
			expect(canonicalizeChord(chord)).toBe(chord);
		}
	});
});
