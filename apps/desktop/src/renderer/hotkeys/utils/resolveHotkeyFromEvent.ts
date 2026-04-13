import { HOTKEYS, type HotkeyId } from "../registry";
import { useHotkeyOverridesStore } from "../stores/hotkeyOverridesStore";

/**
 * Resolves a KeyboardEvent to a registered {@link HotkeyId}, or `null` if the
 * chord is not bound. Uses the same `event.code` normalization as
 * react-hotkeys-hook (its internal `K` function) so the reverse index
 * cannot drift from the matcher.
 *
 * The reverse index is rebuilt whenever the user's override store changes, so
 * consumers like the terminal's `attachCustomKeyEventHandler` always see the
 * current effective bindings (not stale defaults).
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

// Lock keys should never commit a binding on their own.
const LOCK_KEYS = new Set(["capslock", "numlock", "scrolllock"]);

export function normalizeToken(token: string): string {
	const aliased = CODE_ALIASES[token.trim()] ?? token.trim();
	return aliased.toLowerCase().replace(/key|digit|numpad/, "");
}

export function isIgnorableKey(normalized: string): boolean {
	return !normalized || MODIFIERS.has(normalized) || LOCK_KEYS.has(normalized);
}

function normalizeChord(chord: string): string {
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

// Canonical form for string comparison between recorded overrides and registry
// defaults. Tolerates differences in modifier order and token aliases (e.g.
// `meta+alt+up` vs `alt+meta+arrowup`, or `control` vs `ctrl`).
export function canonicalizeChord(chord: string): string {
	return normalizeChord(chord);
}

/**
 * Normalized canonical chord string for a KeyboardEvent, or null if it is a
 * pure modifier / synthetic / ignorable press. Modifier order is sorted to
 * match `canonicalizeChord`, so output is directly comparable with that
 * function's output.
 */
export function eventToChord(event: KeyboardEvent): string | null {
	if (event.code === undefined) return null;
	const key = normalizeToken(event.code);
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
 * True if a KeyboardEvent matches a chord string (in any form the registry or
 * user might produce — `meta+alt+up`, `alt+meta+arrowup`, `control+k`, etc.).
 */
export function matchesChord(event: KeyboardEvent, chord: string): boolean {
	const eventChord = eventToChord(event);
	if (!eventChord) return false;
	return eventChord === canonicalizeChord(chord);
}

/**
 * Terminal-reserved chords (sent straight to the PTY regardless of whether
 * they would otherwise match an app hotkey). Stored in canonical form so
 * lookups via `eventToChord` / `canonicalizeChord` match directly.
 */
export const TERMINAL_RESERVED_CHORDS = new Set([
	"ctrl+c",
	"ctrl+d",
	"ctrl+z",
	"ctrl+s",
	"ctrl+q",
	"ctrl+backslash",
]);

function buildRegisteredAppChords(
	overrides: Record<string, string | null>,
): Map<string, HotkeyId> {
	const map = new Map<string, HotkeyId>();
	for (const id of Object.keys(HOTKEYS) as HotkeyId[]) {
		const hasOverride = id in overrides;
		const override = hasOverride ? overrides[id] : undefined;
		// `null` = user explicitly unassigned the shortcut → drop from index so
		// the terminal does NOT swallow it.
		if (hasOverride && override === null) continue;
		const keys = override ?? HOTKEYS[id].key;
		if (!keys) continue;
		map.set(normalizeChord(keys), id);
	}
	return map;
}

// Live reverse-index, rebuilt whenever overrides change. Using `let` because
// Zustand's `subscribe` mutates the binding on each store update.
let registeredAppChords = buildRegisteredAppChords(
	useHotkeyOverridesStore.getState().overrides,
);

useHotkeyOverridesStore.subscribe((state) => {
	registeredAppChords = buildRegisteredAppChords(state.overrides);
});
