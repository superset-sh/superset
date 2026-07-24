import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import type { ShortcutBinding } from "../types";
import { bindingToDispatchChord } from "../utils/binding";
import { useKeyboardLayoutStore } from "./keyboardLayoutStore";
import {
	getEffectiveLayoutMap,
	isQwertyCommandLayout,
	useKeyboardPreferencesStore,
} from "./keyboardPreferencesStore";

// Reproduces #4674 — "Dvorak – QWERTY ⌘" macOS layout. On this input source
// the OS reverts to QWERTY positions while Command is held, so ⌘-shortcuts
// follow the QWERTY key, not the Dvorak key. Adaptive translation used to run
// unconditionally, mapping ⌘-chords through the Dvorak glyph map, so every
// command shortcut landed on the wrong physical key.

// Dvorak glyph map (Map<event.code, unshifted glyph>): physical KeyR prints
// "p", physical KeyP prints "l". Mirrors what native-keymap reports for the
// Dvorak layout, since it exposes no separate command layer.
const dvorakMap = new Map<string, string>([
	["KeyA", "a"],
	["KeyP", "l"],
	["KeyR", "p"],
	["KeyL", "n"],
	["KeyZ", ";"],
]);

// QUICK_OPEN's mac default (registry.ts): logical "meta+p" (⌘P).
const QUICK_OPEN_MAC: ShortcutBinding = {
	version: 2,
	mode: "logical",
	chord: "meta+p",
};

const DVORAK_QWERTY_CMD_ID = "com.apple.keylayout.DVORAK-QWERTYCMD";

describe("isQwertyCommandLayout", () => {
	it("detects Apple's Dvorak – QWERTY ⌘ layout id", () => {
		expect(isQwertyCommandLayout(DVORAK_QWERTY_CMD_ID)).toBe(true);
	});

	it("detects spaced / separated QWERTY-command variants", () => {
		expect(isQwertyCommandLayout("Dvorak - QWERTY ⌘")).toBe(true);
		expect(isQwertyCommandLayout("some.layout.QWERTY-COMMAND")).toBe(true);
		expect(isQwertyCommandLayout("foo_qwerty_cmd")).toBe(true);
	});

	it("does not flag plain layouts", () => {
		expect(isQwertyCommandLayout("com.apple.keylayout.US")).toBe(false);
		expect(isQwertyCommandLayout("com.apple.keylayout.Dvorak")).toBe(false);
		expect(isQwertyCommandLayout("com.apple.keylayout.German")).toBe(false);
		expect(isQwertyCommandLayout("")).toBe(false);
	});
});

describe("getEffectiveLayoutMap — QWERTY-command layouts (#4674)", () => {
	let originalMap: ReadonlyMap<string, string> | null;
	let originalLayoutId: string;
	let originalAdaptive: boolean;

	beforeEach(() => {
		const layout = useKeyboardLayoutStore.getState();
		originalMap = layout.map;
		originalLayoutId = layout.layoutId;
		originalAdaptive =
			useKeyboardPreferencesStore.getState().adaptiveLayoutEnabled;
	});
	afterEach(() => {
		useKeyboardLayoutStore.setState({
			map: originalMap,
			layoutId: originalLayoutId,
		});
		useKeyboardPreferencesStore.setState({
			adaptiveLayoutEnabled: originalAdaptive,
		});
	});

	it("still translates through the map on an ordinary Dvorak layout", () => {
		useKeyboardPreferencesStore.setState({ adaptiveLayoutEnabled: true });
		useKeyboardLayoutStore.setState({
			map: dvorakMap,
			layoutId: "com.apple.keylayout.Dvorak",
		});
		// Plain Dvorak: ⌘P follows the printed "p" key → physical KeyR.
		expect(
			bindingToDispatchChord(QUICK_OPEN_MAC, getEffectiveLayoutMap()),
		).toBe("meta+r");
	});

	it("disables adaptive translation on Dvorak – QWERTY ⌘ so ⌘P stays on QWERTY P", () => {
		useKeyboardPreferencesStore.setState({ adaptiveLayoutEnabled: true });
		useKeyboardLayoutStore.setState({
			map: dvorakMap,
			layoutId: DVORAK_QWERTY_CMD_ID,
		});
		// The map itself is still Dvorak, but adaptive mapping must be bypassed.
		expect(getEffectiveLayoutMap()).toBeNull();
		// ⌘P must dispatch to physical KeyP ("meta+p"), matching what the OS
		// sends while Command is held. Before the fix this returned "meta+r".
		expect(
			bindingToDispatchChord(QUICK_OPEN_MAC, getEffectiveLayoutMap()),
		).toBe("meta+p");
	});
});
