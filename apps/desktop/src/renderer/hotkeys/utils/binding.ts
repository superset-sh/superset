import type { ParsedBinding, ShortcutBinding } from "../types";
import { canonicalizeChord, normalizeToken } from "./resolveHotkeyFromEvent";

/**
 * Keys whose `event.code` is stable across keyboard layouts (Enter, arrows,
 * Backspace, ...). Tokens listed here are post-`normalizeToken` form —
 * aliases like `esc` / `up` / `return` resolve to their canonical names
 * (`escape`, `arrowup`, `enter`) before lookup, so this set must mirror the
 * canonical side only.
 */
export const NAMED_KEYS = new Set([
	"enter",
	"escape",
	"backspace",
	"delete",
	"tab",
	"space",
	"arrowup",
	"arrowdown",
	"arrowleft",
	"arrowright",
	"home",
	"end",
	"pageup",
	"pagedown",
	"insert",
]);

export function isFunctionKey(token: string): boolean {
	return /^f([1-9]|1[0-2])$/.test(token);
}

/** Mode used when promoting a legacy string binding (no explicit mode). */
export function defaultModeForChord(chord: string): "physical" | "named" {
	const parts = canonicalizeChord(chord).split("+");
	const key = parts[parts.length - 1];
	if (!key) return "physical";
	if (NAMED_KEYS.has(key) || isFunctionKey(key)) return "named";
	return "physical";
}

/** Normalize a stored binding (string or v2 object) into `{ mode, chord }`. */
export function parseBinding(binding: ShortcutBinding): ParsedBinding {
	if (typeof binding === "string") {
		return { mode: defaultModeForChord(binding), chord: binding };
	}
	return { mode: binding.mode, chord: binding.chord };
}

/**
 * Compact storage form: physical → bare string (matches legacy storage and
 * shipped registry defaults); logical / named → v2 object.
 */
export function serializeBinding(parsed: ParsedBinding): ShortcutBinding {
	const chord = canonicalizeChord(parsed.chord);
	if (parsed.mode === "physical") return chord;
	return { version: 2, mode: parsed.mode, chord };
}

/**
 * Resolve a binding to the event.code-form chord react-hotkeys-hook matches
 * against. Logical bindings are translated through the current layout map
 * (e.g. logical `meta+z` on QWERTZ becomes `meta+y` because the Z character
 * lives on physical KeyY there). Single source of truth shared by useHotkey,
 * useHotkeyDisplay, useFormatBinding, the conflict detector, and the
 * terminal-forwarding reverse index.
 */
export function bindingToDispatchChord(
	binding: ShortcutBinding | null,
	layoutMap: ReadonlyMap<string, string> | null,
): string | null {
	if (!binding) return null;
	const parsed = parseBinding(binding);
	if (parsed.mode !== "logical") return parsed.chord;
	return translateLogicalChord(parsed.chord, layoutMap) ?? parsed.chord;
}

/** Two bindings refer to the same chord under the same matching semantics. */
export function bindingsEqual(
	a: ShortcutBinding | null,
	b: ShortcutBinding | null,
): boolean {
	if (a === null || b === null) return a === b;
	const pa = parseBinding(a);
	const pb = parseBinding(b);
	return (
		pa.mode === pb.mode &&
		canonicalizeChord(pa.chord) === canonicalizeChord(pb.chord)
	);
}

// Registry's canonical token form ("slash") → layout-map's unshifted glyph form ("/").
const PUNCT_ALIAS_TO_GLYPH: Record<string, string> = {
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

/**
 * Translate a logical chord ("meta+p") into the equivalent event.code-based
 * chord for the user's current layout. On US QWERTY: `meta+p` → `meta+p`.
 * On Dvorak: `meta+p` → `meta+r` (physical KeyR prints "p"). Named/F-keys
 * pass through unchanged. Returns null when the produced character isn't on
 * the keyboard — caller falls back to the untranslated chord.
 */
export function translateLogicalChord(
	chord: string,
	layoutMap: ReadonlyMap<string, string> | null,
): string | null {
	if (!layoutMap) return null;
	const canonical = canonicalizeChord(chord);
	const parts = canonical.split("+");
	const key = parts[parts.length - 1];
	if (!key) return null;
	if (NAMED_KEYS.has(key) || isFunctionKey(key)) return canonical;

	const targetGlyph = PUNCT_ALIAS_TO_GLYPH[key] ?? key;
	for (const [scanCode, glyph] of layoutMap) {
		if (glyph.toLowerCase() === targetGlyph.toLowerCase()) {
			parts[parts.length - 1] = normalizeToken(scanCode);
			return parts.join("+");
		}
	}
	return null;
}
