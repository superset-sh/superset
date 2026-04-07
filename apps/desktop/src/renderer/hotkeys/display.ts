/**
 * Display formatting for hotkey bindings.
 * Converts key strings like "meta+shift+n" into platform-specific symbols.
 */

import type { HotkeyDisplay, Platform } from "./types";

const MODIFIER_DISPLAY: Record<Platform, Record<string, string>> = {
	mac: { meta: "⌘", ctrl: "⌃", alt: "⌥", shift: "⇧" },
	windows: { meta: "Win", ctrl: "Ctrl", alt: "Alt", shift: "Shift" },
	linux: { meta: "Super", ctrl: "Ctrl", alt: "Alt", shift: "Shift" },
};

const KEY_DISPLAY: Record<string, string> = {
	enter: "↵",
	backspace: "⌫",
	delete: "⌦",
	escape: "⎋",
	tab: "⇥",
	up: "↑",
	down: "↓",
	left: "←",
	right: "→",
	space: "␣",
	slash: "/",
	comma: ",",
	bracketleft: "[",
	bracketright: "]",
};

const MODIFIER_ORDER = ["meta", "ctrl", "alt", "shift"] as const;

/**
 * Format a key string into display symbols.
 * e.g. "meta+shift+n" on mac → { keys: ["⌘", "⇧", "N"], text: "⌘⇧N" }
 */
export function formatHotkeyDisplay(
	keys: string | null,
	platform: Platform,
): HotkeyDisplay {
	if (!keys) return { keys: ["Unassigned"], text: "Unassigned" };
	const parts = keys.toLowerCase().split("+");
	const modifiers = parts.filter((p) =>
		MODIFIER_ORDER.includes(p as (typeof MODIFIER_ORDER)[number]),
	);
	const key = parts.find(
		(p) => !MODIFIER_ORDER.includes(p as (typeof MODIFIER_ORDER)[number]),
	);
	if (!key) return { keys: ["Unassigned"], text: "Unassigned" };

	const modSymbols = MODIFIER_ORDER.filter((m) => modifiers.includes(m)).map(
		(m) => MODIFIER_DISPLAY[platform][m],
	);
	const keyDisplay = KEY_DISPLAY[key] ?? key.toUpperCase();
	const displayKeys = [...modSymbols, keyDisplay];
	const separator = platform === "mac" ? "" : "+";
	return { keys: displayKeys, text: displayKeys.join(separator) };
}
