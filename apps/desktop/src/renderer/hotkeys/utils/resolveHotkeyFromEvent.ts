import { HOTKEYS, type HotkeyId } from "../registry";
import { useHotkeyOverridesStore } from "../stores/hotkeyOverridesStore";
import { useKeyboardLayoutStore } from "../stores/keyboardLayoutStore";
import { useKeyboardPreferencesStore } from "../stores/keyboardPreferencesStore";
import type { ShortcutBinding } from "../types";
import { bindingToDispatchChord } from "./binding";

/** Layout map for the resolver — null when the user has disabled adaptive
 *  layout mapping, so logical bindings keep their authored chord. */
function activeLayoutMap(): ReadonlyMap<string, string> | null {
	if (!useKeyboardPreferencesStore.getState().adaptiveLayoutEnabled) {
		return null;
	}
	return useKeyboardLayoutStore.getState().map;
}

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
	overrides: Record<string, ShortcutBinding | null>,
	layoutMap: ReadonlyMap<string, string> | null,
): Map<string, HotkeyId> {
	const map = new Map<string, HotkeyId>();
	for (const id of Object.keys(HOTKEYS) as HotkeyId[]) {
		const hasOverride = id in overrides;
		const override = hasOverride ? overrides[id] : undefined;
		// Explicit unassignment (null override) must drop from the index — else
		// the terminal's isAppHotkey check would swallow the freed chord.
		if (hasOverride && override === null) continue;
		const binding = override ?? HOTKEYS[id].key;
		if (!binding) continue;
		const dispatchChord = bindingToDispatchChord(binding, layoutMap);
		if (!dispatchChord) continue;
		map.set(canonicalizeChord(dispatchChord), id);
	}
	return map;
}

// Reassigned on each override, layout, OR adaptive-layout-toggle change;
// `let` is required so the subscribe callbacks can replace the reference
// the resolver reads.
let registeredAppChords = buildRegisteredAppChords(
	useHotkeyOverridesStore.getState().overrides,
	activeLayoutMap(),
);
useHotkeyOverridesStore.subscribe((state) => {
	registeredAppChords = buildRegisteredAppChords(
		state.overrides,
		activeLayoutMap(),
	);
});
useKeyboardLayoutStore.subscribe(() => {
	registeredAppChords = buildRegisteredAppChords(
		useHotkeyOverridesStore.getState().overrides,
		activeLayoutMap(),
	);
});
useKeyboardPreferencesStore.subscribe(() => {
	registeredAppChords = buildRegisteredAppChords(
		useHotkeyOverridesStore.getState().overrides,
		activeLayoutMap(),
	);
});
