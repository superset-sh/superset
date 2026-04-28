/**
 * Display formatting for hotkey bindings.
 * Converts key strings like "meta+shift+n" into platform-specific symbols.
 */

import type { HotkeyDisplay, Platform } from "./types";
import { normalizeToken } from "./utils/resolveHotkeyFromEvent";

const MODIFIER_DISPLAY: Record<Platform, Record<string, string>> = {
	mac: { meta: "⌘", ctrl: "⌃", alt: "⌥", shift: "⇧" },
	windows: { meta: "Win", ctrl: "Ctrl", alt: "Alt", shift: "Shift" },
	linux: { meta: "Super", ctrl: "Ctrl", alt: "Alt", shift: "Shift" },
};

// Keyed by canonical (event.code-normalized) tokens. normalizeToken aliases
// the short forms (`up` → `arrowup`, `esc` → `escape`) so only canonical
// names need entries here.
const KEY_DISPLAY: Record<string, string> = {
	enter: "↵",
	backspace: "⌫",
	delete: "⌦",
	escape: "⎋",
	tab: "⇥",
	arrowup: "↑",
	arrowdown: "↓",
	arrowleft: "←",
	arrowright: "→",
	space: "␣",
	slash: "/",
	backslash: "\\",
	comma: ",",
	period: ".",
	semicolon: ";",
	quote: "'",
	backquote: "`",
	minus: "-",
	equal: "=",
	bracketleft: "[",
	bracketright: "]",
};

// canonical token (e.g. "z", "slash") → event.code (e.g. "KeyZ", "Slash")
// for keymap lookup against the layout data sourced from native-keymap.
// Only includes printable keys whose glyph varies by layout. Special keys
// (Enter, arrows, etc.) deliberately stay on KEY_DISPLAY — their
// event.code isn't a printable character.
const PRINTABLE_TO_SCAN_CODE: Record<string, string> = {
	slash: "Slash",
	backslash: "Backslash",
	comma: "Comma",
	period: "Period",
	semicolon: "Semicolon",
	quote: "Quote",
	backquote: "Backquote",
	minus: "Minus",
	equal: "Equal",
	bracketleft: "BracketLeft",
	bracketright: "BracketRight",
};

function canonicalToScanCode(canonical: string): string | null {
	if (/^[a-z]$/.test(canonical)) return `Key${canonical.toUpperCase()}`;
	if (/^[0-9]$/.test(canonical)) return `Digit${canonical}`;
	return PRINTABLE_TO_SCAN_CODE[canonical] ?? null;
}

/** Glyph printed at this physical key on the user's current layout, or null. */
export function glyphForCode(
	canonical: string,
	layoutMap: ReadonlyMap<string, string> | null,
): string | null {
	if (!layoutMap) return null;
	const scan = canonicalToScanCode(canonical);
	if (!scan) return null;
	const v = layoutMap.get(scan);
	if (!v || v.length !== 1) return null;
	// Uppercase only ASCII letters. Some layout glyphs expand to multiple
	// characters when uppercased (`ß` → `SS`, Turkish `ı` → `I`/`İ`) which
	// would break single-glyph keycap rendering — keep those as-is.
	return /^[a-z]$/.test(v) ? v.toUpperCase() : v;
}

const MODIFIER_ORDER = ["meta", "ctrl", "alt", "shift"] as const;
type Modifier = (typeof MODIFIER_ORDER)[number];

const isModifier = (p: string): p is Modifier =>
	(MODIFIER_ORDER as readonly string[]).includes(p);

/**
 * Format a chord string into display symbols.
 * e.g. `"meta+shift+n"` on mac → `{ keys: ["⌘", "⇧", "N"], text: "⌘⇧N" }`
 *
 * `layoutMap` (optional) is `Map<event.code, unshifted glyph>` derived from
 * the OS keyboard layout (sourced from native-keymap via the main process).
 * When provided, printable keys (letters/digits/punctuation) are looked up
 * so the displayed glyph matches what the user sees on their physical key
 * — e.g. `meta+z` shows `⌘Y` on a German QWERTZ keyboard. When null, falls
 * back to the US-ANSI glyph table.
 */
export function formatHotkeyDisplay(
	keys: string | null,
	platform: Platform,
	layoutMap: ReadonlyMap<string, string> | null = null,
): HotkeyDisplay {
	if (!keys) return { keys: ["Unassigned"], text: "Unassigned" };

	const parts = keys
		.toLowerCase()
		.split("+")
		.map(normalizeToken)
		.map((p) => (p === "control" ? "ctrl" : p));

	const modifiers = parts.filter(isModifier);
	const key = parts.find((p) => !isModifier(p));
	if (!key) return { keys: ["Unassigned"], text: "Unassigned" };

	const modSymbols = MODIFIER_ORDER.filter((m) => modifiers.includes(m)).map(
		(m) => MODIFIER_DISPLAY[platform][m],
	);
	// Order matters: layoutMap wins for printable keys (so QWERTZ shows the
	// user's printed glyph for `KeyZ`), KEY_DISPLAY wins for special keys
	// (Enter, arrows, etc. — glyphForCode returns null for these because
	// PRINTABLE_TO_SCAN_CODE doesn't include them).
	const keyDisplay =
		glyphForCode(key, layoutMap) ?? KEY_DISPLAY[key] ?? key.toUpperCase();
	const displayKeys = [...modSymbols, keyDisplay];
	const separator = platform === "mac" ? "" : "+";
	return { keys: displayKeys, text: displayKeys.join(separator) };
}
