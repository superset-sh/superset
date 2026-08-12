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

const CODE_ALIASES_LOWER: Record<string, string> = Object.fromEntries(
	Object.entries(CODE_ALIASES).map(([key, value]) => [
		key.toLowerCase(),
		value,
	]),
);

export function normalizeToken(token: string): string {
	const trimmed = token.trim();
	// Case-insensitive alias lookup: chord strings arrive both as raw
	// event.code (`MetaLeft`) and as pre-lowercased tokens (`metaleft`).
	const aliased = CODE_ALIASES_LOWER[trimmed.toLowerCase()] ?? trimmed;
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
	// normalizeToken lowercases after its alias lookup; lowercasing here first
	// would break case-sensitive physical-code aliases like `MetaLeft` → meta.
	const parts = chord.split("+").map(normalizeToken);
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

interface ChordModifiers {
	meta: boolean;
	ctrl: boolean;
	alt: boolean;
	shift: boolean;
}

/**
 * Key code + already-resolved modifiers → canonical chord, or null when the key
 * can't form one on its own (modifier / lock key). The sole place modifier
 * ordering lives, so every code→chord path canonicalizes identically — callers
 * differ only in how they detect the code and resolve modifiers.
 */
function assembleChord(code: string, mods: ChordModifiers): string | null {
	const key = normalizeToken(code);
	if (isIgnorableKey(key)) return null;
	const parts: string[] = [];
	if (mods.meta) parts.push("meta");
	if (mods.ctrl) parts.push("ctrl");
	if (mods.alt) parts.push("alt");
	if (mods.shift) parts.push("shift");
	parts.sort();
	return [...parts, key].join("+");
}

/** KeyboardEvent → canonical chord (comparable to {@link canonicalizeChord} output), or null for pure modifier / synthetic presses. */
export function eventToChord(event: KeyboardEvent): string | null {
	if (event.code === undefined) return null;
	// Ignore CJK / dead-key composition. Safari reports keyCode 229 here.
	if (event.isComposing || event.keyCode === 229) return null;
	// AltGr surfaces as ctrlKey+altKey in Chromium; drop both so printable
	// non-US keystrokes (AltGr+E = € on German) don't trigger ctrl+alt+e.
	const altGraph = event.getModifierState?.("AltGraph") === true;
	return assembleChord(event.code, {
		meta: event.metaKey,
		ctrl: event.ctrlKey && !altGraph,
		alt: event.altKey && !altGraph,
		shift: event.shiftKey,
	});
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
 * Electron key input → canonical chord for the main process. Shares
 * {@link assembleChord} with {@link eventToChord}, so a given key produces the
 * same chord in both processes. The DOM-only AltGr/IME guards are absent here
 * because Electron's `Input` doesn't surface them.
 */
export function chordFromInput(input: KeyChordInput): string | null {
	if (!input.code) return null;
	return assembleChord(input.code, {
		meta: input.meta,
		ctrl: input.control,
		alt: input.alt,
		shift: input.shift,
	});
}
