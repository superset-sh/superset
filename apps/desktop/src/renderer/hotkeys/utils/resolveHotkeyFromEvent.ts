import { HOTKEYS, type HotkeyId } from "../registry";

/**
 * Resolves a KeyboardEvent to a registered {@link HotkeyId}, or `null` if the
 * chord is not bound. Uses the same `event.code` normalization as
 * react-hotkeys-hook (its internal `K` function) so the reverse index
 * cannot drift from the matcher.
 */
export function resolveHotkeyFromEvent(event: KeyboardEvent): HotkeyId | null {
	if (event.type !== "keydown") return null;
	const chord = eventToChord(event);
	if (!chord) return null;
	return REGISTERED_APP_CHORDS.get(chord) ?? null;
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

function eventToChord(event: KeyboardEvent): string | null {
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

const REGISTERED_APP_CHORDS: Map<string, HotkeyId> = new Map(
	(Object.keys(HOTKEYS) as HotkeyId[]).map((id) => [
		normalizeChord(HOTKEYS[id].key),
		id,
	]),
);
