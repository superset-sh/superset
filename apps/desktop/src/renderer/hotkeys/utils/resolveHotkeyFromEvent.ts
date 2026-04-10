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

const MODIFIERS = new Set(["meta", "ctrl", "control", "alt", "shift"]);

function normalizeToken(token: string): string {
	const aliased = CODE_ALIASES[token.trim()] ?? token.trim();
	return aliased.toLowerCase().replace(/key|digit|numpad/, "");
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

function eventToChord(event: KeyboardEvent): string | null {
	const key = normalizeToken(event.code);
	if (!key || MODIFIERS.has(key)) return null;
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
