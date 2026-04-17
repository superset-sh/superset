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

const MODIFIER_ORDER = ["meta", "ctrl", "alt", "shift"] as const;
type Modifier = (typeof MODIFIER_ORDER)[number];

const isModifier = (p: string): p is Modifier =>
	(MODIFIER_ORDER as readonly string[]).includes(p);

/**
 * Format a chord string into display symbols.
 * e.g. `"meta+shift+n"` on mac → `{ keys: ["⌘", "⇧", "N"], text: "⌘⇧N" }`
 */
export function formatHotkeyDisplay(
	keys: string | null,
	platform: Platform,
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
	const keyDisplay = KEY_DISPLAY[key] ?? key.toUpperCase();
	const displayKeys = [...modSymbols, keyDisplay];
	const separator = platform === "mac" ? "" : "+";
	return { keys: displayKeys, text: displayKeys.join(separator) };
}
