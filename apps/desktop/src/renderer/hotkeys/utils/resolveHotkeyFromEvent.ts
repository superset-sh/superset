import { HOTKEYS, type HotkeyId } from "../registry";
import { useHotkeyOverridesStore } from "../stores/hotkeyOverridesStore";
import {
	getMatchByTypedKey,
	useKeyboardPreferencesStore,
} from "../stores/keyboardPreferencesStore";

/**
 * KeyboardEvent → registered {@link HotkeyId}, or `null` if unbound. Honors
 * the `matchByTypedKey` preference: when on, builds the chord from
 * `event.key` (the typed character); when off, from `event.code` (the
 * physical key). Index is rebuilt on every override / preference change.
 */
export function resolveHotkeyFromEvent(event: KeyboardEvent): HotkeyId | null {
	if (event.type !== "keydown") return null;
	const chord = eventToChord(event);
	if (!chord) return null;
	return registeredAppChords.get(chord) ?? null;
}

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

/** KeyboardEvent → canonical chord, or null for pure-modifier / synthetic
 *  presses. Reads `matchByTypedKey` to pick `event.key` vs `event.code`. */
export function eventToChord(event: KeyboardEvent): string | null {
	if (event.code === undefined) return null;
	// IME composition: keydown during CJK / dead-key composition must not
	// trigger hotkeys. Safari reports keyCode 229 instead of isComposing.
	if (event.isComposing || event.keyCode === 229) return null;
	// AltGr is reported by Chromium as ctrlKey+altKey on Windows/Linux.
	// Treating that combination as Ctrl+Alt would let printable keystrokes on
	// non-US layouts (e.g. AltGr+E = € on German) accidentally trigger
	// ctrl+alt+e bindings. Suppress both when AltGr is held.
	const altGraph = event.getModifierState?.("AltGraph") === true;
	const codeKey = normalizeToken(event.code);
	if (isIgnorableKey(codeKey)) return null;
	const useTypedKey = getMatchByTypedKey();
	const key = useTypedKey ? typedKeyToken(event, codeKey) : codeKey;
	const mods: string[] = [];
	if (event.metaKey) mods.push("meta");
	if (event.ctrlKey && !altGraph) mods.push("ctrl");
	if (event.altKey && !altGraph) mods.push("alt");
	if (event.shiftKey) mods.push("shift");
	mods.sort();
	return [...mods, key].join("+");
}

/** When `matchByTypedKey` is on, we use the typed character (`event.key`)
 *  for printable keys but fall back to the normalized `event.code` for
 *  non-printable keys (Enter, ArrowUp, F-keys, …) since `event.key` for
 *  those is "Enter" / "ArrowUp" / "F1", which lowercase identically. */
function typedKeyToken(event: KeyboardEvent, codeFallback: string): string {
	const key = (event.key ?? "").toLowerCase();
	if (key.length === 1 && /\S/.test(key)) return key;
	if (key.length > 0) return normalizeToken(key);
	return codeFallback;
}

/** True if `event` produces `chord` (tolerating modifier order / aliases). */
export function matchesChord(event: KeyboardEvent, chord: string): boolean {
	const eventChord = eventToChord(event);
	if (!eventChord) return false;
	return eventChord === canonicalizeChord(chord);
}

/** Sent straight to the PTY. Canonicalized at build time so lookups via `eventToChord` / `canonicalizeChord` match directly. */
export const TERMINAL_RESERVED_CHORDS = new Set(
	["ctrl+c", "ctrl+d", "ctrl+z", "ctrl+s", "ctrl+q", "ctrl+backslash"].map(
		canonicalizeChord,
	),
);

/** True if the event matches a chord the terminal must always receive. */
export function isTerminalReservedEvent(event: KeyboardEvent): boolean {
	const chord = eventToChord(event);
	if (!chord) return false;
	return TERMINAL_RESERVED_CHORDS.has(chord);
}

function buildRegisteredAppChords(
	overrides: Record<string, string | null>,
): Map<string, HotkeyId> {
	const map = new Map<string, HotkeyId>();
	for (const id of Object.keys(HOTKEYS) as HotkeyId[]) {
		const hasOverride = id in overrides;
		const override = hasOverride ? overrides[id] : undefined;
		// Explicit unassignment (null override) must drop from the index — else
		// the terminal's isAppHotkey check would swallow the freed chord.
		if (hasOverride && override === null) continue;
		const chord = override ?? HOTKEYS[id].key;
		if (!chord) continue;
		map.set(canonicalizeChord(chord), id);
	}
	return map;
}

// Reassigned on each override change; `let` is required so the subscribe
// callback can replace the reference the resolver reads. The
// `matchByTypedKey` toggle doesn't affect the index — registered chords are
// stored as written ("meta+t"); the *event*-side conversion in eventToChord
// is what shifts based on the toggle.
let registeredAppChords = buildRegisteredAppChords(
	useHotkeyOverridesStore.getState().overrides,
);
function rebuild() {
	registeredAppChords = buildRegisteredAppChords(
		useHotkeyOverridesStore.getState().overrides,
	);
}
useHotkeyOverridesStore.subscribe(rebuild);
useKeyboardPreferencesStore.subscribe(rebuild);
