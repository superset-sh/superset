import { HOTKEYS, type HotkeyId } from "../registry";
import { useHotkeyOverridesStore } from "../stores/hotkeyOverridesStore";

/**
 * KeyboardEvent → registered {@link HotkeyId}, or `null` if unbound. Uses the
 * same `event.code` normalization as react-hotkeys-hook so the reverse index
 * can't drift from the matcher. Index reflects current overrides, not frozen
 * defaults — see {@link registeredAppChords}.
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

/** KeyboardEvent → canonical chord (comparable to {@link canonicalizeChord} output), or null for pure modifier / synthetic presses. */
export function eventToChord(event: KeyboardEvent): string | null {
	if (event.code === undefined) return null;
	const key = layoutAwareKey(event);
	if (isIgnorableKey(key)) return null;
	const mods: string[] = [];
	if (event.metaKey) mods.push("meta");
	if (event.ctrlKey) mods.push("ctrl");
	if (event.altKey) mods.push("alt");
	if (event.shiftKey) mods.push("shift");
	mods.sort();
	return [...mods, key].join("+");
}

/**
 * Resolve a layout-aware key token from a KeyboardEvent.
 *
 * For letter keys (event.code `Key[A-Z]`), prefer `event.key` when it yields a
 * single Latin letter. This makes shortcuts match the **labeled** character on
 * the user's keyboard (e.g. AZERTY, QWERTZ) instead of the physical QWERTY
 * position. For non-letter keys (digits, punctuation, arrows, function keys)
 * we keep `event.code` because `event.key` is unreliable there (Shift+2 → "@",
 * Alt+L on macOS → "¬", dead-key compositions → "Dead").
 */
export function layoutAwareKey(event: KeyboardEvent): string {
	if (
		/^Key[A-Z]$/.test(event.code) &&
		typeof event.key === "string" &&
		/^[a-zA-Z]$/.test(event.key)
	) {
		return event.key.toLowerCase();
	}
	return normalizeToken(event.code);
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
		const keys = override ?? HOTKEYS[id].key;
		if (!keys) continue;
		map.set(canonicalizeChord(keys), id);
	}
	return map;
}

// Reassigned on each override-store change; `let` is required so the
// subscribe callback can replace the reference the resolver reads.
let registeredAppChords = buildRegisteredAppChords(
	useHotkeyOverridesStore.getState().overrides,
);
useHotkeyOverridesStore.subscribe((state) => {
	registeredAppChords = buildRegisteredAppChords(state.overrides);
});
