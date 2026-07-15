/**
 * Pure keyboard-chord normalization shared by the renderer hotkey system and
 * the main-process webview key-forwarder. Kept free of store/DOM dependencies
 * so both processes canonicalize chords identically (single source of truth).
 */

// Mirrors react-hotkeys-hook's alias table (react-hotkeys-hook/dist/index.js:3-19)
const CODE_ALIASES: Record<string, string> = {
	esc: "escape",
	return: "enter",
	left: "arrowleft",
	right: "arrowright",
	up: "arrowup",
	down: "arrowdown",
	MetaLeft: "meta",
	MetaRight: "meta",
	ShiftLeft: "shift",
	ShiftRight: "shift",
	AltLeft: "alt",
	AltRight: "alt",
	OSLeft: "meta",
	OSRight: "meta",
	ControlLeft: "ctrl",
	ControlRight: "ctrl",
};

export const MODIFIERS = new Set(["meta", "ctrl", "control", "alt", "shift"]);

// Lock keys must never commit a binding on their own.
const LOCK_KEYS = new Set(["capslock", "numlock", "scrolllock"]);

export function normalizeToken(token: string): string {
	const aliased = CODE_ALIASES[token.trim()] ?? token.trim();
	return aliased.toLowerCase().replace(/key|digit|numpad/, "");
}

export function isIgnorableKey(normalized: string): boolean {
	return !normalized || MODIFIERS.has(normalized) || LOCK_KEYS.has(normalized);
}

/**
 * Stable form for comparing chord strings. Tolerates modifier order and
 * aliases: `meta+alt+up` ≡ `alt+meta+arrowup` ≡ `control+alt+arrowup`.
 */
export function canonicalizeChord(chord: string): string {
	const parts = chord.toLowerCase().split("+").map(normalizeToken);
	const mods: string[] = [];
	const keys: string[] = [];
	for (const part of parts) {
		if (MODIFIERS.has(part)) {
			mods.push(part === "control" ? "ctrl" : part);
		} else {
			keys.push(part);
		}
	}
	mods.sort();
	return [...mods, ...keys].join("+");
}

/** KeyboardEvent → canonical chord (comparable to {@link canonicalizeChord} output), or null for pure modifier / synthetic presses. */
export function eventToChord(event: KeyboardEvent): string | null {
	if (event.code === undefined) return null;
	// IME composition: keydown during CJK / dead-key composition must not
	// trigger hotkeys. Safari reports keyCode 229 instead of isComposing.
	if (event.isComposing || event.keyCode === 229) return null;
	const key = normalizeToken(event.code);
	if (isIgnorableKey(key)) return null;
	// AltGr is reported by Chromium as ctrlKey+altKey on Windows/Linux.
	// Treating that combination as Ctrl+Alt would let printable keystrokes on
	// non-US layouts (e.g. AltGr+E = € on German) accidentally trigger
	// ctrl+alt+e bindings. Suppress both when AltGr is held; no binding opts
	// into AltGr explicitly.
	const altGraph = event.getModifierState?.("AltGraph") === true;
	const mods: string[] = [];
	if (event.metaKey) mods.push("meta");
	if (event.ctrlKey && !altGraph) mods.push("ctrl");
	if (event.altKey && !altGraph) mods.push("alt");
	if (event.shiftKey) mods.push("shift");
	mods.sort();
	return [...mods, key].join("+");
}

/** True if `event` produces `chord` (tolerating modifier order / aliases). */
export function matchesChord(event: KeyboardEvent, chord: string): boolean {
	const eventChord = eventToChord(event);
	if (!eventChord) return false;
	return eventChord === canonicalizeChord(chord);
}

/** Electron `before-input-event` input shape, used by the main process. */
export interface KeyChordInput {
	code: string;
	meta: boolean;
	control: boolean;
	alt: boolean;
	shift: boolean;
}

/**
 * Electron key input → canonical chord, matching {@link eventToChord} so the
 * main process can compare guest keystrokes against the renderer-registered
 * forwardable chords. Returns null for pure modifier presses.
 */
export function chordFromInput(input: KeyChordInput): string | null {
	if (!input.code) return null;
	const key = normalizeToken(input.code);
	if (isIgnorableKey(key)) return null;
	const mods: string[] = [];
	if (input.meta) mods.push("meta");
	if (input.control) mods.push("ctrl");
	if (input.alt) mods.push("alt");
	if (input.shift) mods.push("shift");
	mods.sort();
	return [...mods, key].join("+");
}
