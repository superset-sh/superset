import type { ParsedBinding, ShortcutBinding } from "../types";
import { canonicalizeChord, normalizeToken } from "./resolveHotkeyFromEvent";

const NAMED_KEYS = new Set([
	"enter",
	"return",
	"escape",
	"esc",
	"backspace",
	"delete",
	"tab",
	"space",
	"arrowup",
	"arrowdown",
	"arrowleft",
	"arrowright",
	"up",
	"down",
	"left",
	"right",
	"home",
	"end",
	"pageup",
	"pagedown",
	"insert",
]);

function isFunctionKey(token: string): boolean {
	return /^f([1-9]|1[0-2])$/.test(token);
}

/**
 * Default mode inferred from the chord's key token. Used when:
 * - Promoting a legacy string binding (no explicit mode) to ParsedBinding
 * - Defaulting the recorder to a sensible mode based on the captured key
 *
 * Logic:
 * - Named keys (Enter, ArrowUp, F5, etc.) → `named` (event.code is stable)
 * - Anything else (letters, digits, punctuation) → `physical` for legacy
 *   bindings (preserves today's behavior). The recorder may override this
 *   to `logical` for newly-captured user bindings.
 */
export function defaultModeForChord(chord: string): "physical" | "named" {
	const parts = canonicalizeChord(chord).split("+");
	const key = parts[parts.length - 1];
	if (!key) return "physical";
	if (NAMED_KEYS.has(key) || isFunctionKey(key)) return "named";
	return "physical";
}

/**
 * Normalize a stored binding (string or v2 object) into `{ mode, chord }`.
 * Legacy strings get mode inferred via `defaultModeForChord`.
 */
export function parseBinding(binding: ShortcutBinding): ParsedBinding {
	if (typeof binding === "string") {
		return { mode: defaultModeForChord(binding), chord: binding };
	}
	return { mode: binding.mode, chord: binding.chord };
}

/**
 * Inverse of `parseBinding`. Returns the most compact serializable form:
 * - `physical` mode → bare chord string (matches legacy storage; shipped
 *   defaults look unchanged in localStorage)
 * - `logical` / `named` mode → v2 object
 */
export function serializeBinding(parsed: ParsedBinding): ShortcutBinding {
	const chord = canonicalizeChord(parsed.chord);
	if (parsed.mode === "physical") return chord;
	return { version: 2, mode: parsed.mode, chord };
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

/**
 * Translate a logical chord ("meta+p") into the equivalent event.code-based
 * chord for the user's current layout, so it can be registered with
 * react-hotkeys-hook (which matches by event.code by default).
 *
 * On US QWERTY: `meta+p` → `meta+p` (KeyP prints "p")
 * On Dvorak:    `meta+p` → `meta+r` (physical KeyR prints "p")
 *
 * Returns `null` if the produced character isn't found in the layout map —
 * the caller should fall back to the un-translated chord (works on US) or
 * skip registration. Named/special keys (Enter, ArrowUp, F5, ...) and
 * non-printable tokens pass through unchanged because they don't have a
 * "produced character" to look up.
 */
// Punctuation aliases ("slash" → "/") used to map between the registry's
// canonical token form and the layout map's unshifted glyph form.
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

export function translateLogicalChord(
	chord: string,
	layoutMap: ReadonlyMap<string, string> | null,
): string | null {
	if (!layoutMap) return null;
	const parts = canonicalizeChord(chord).split("+");
	const key = parts[parts.length - 1];
	if (!key) return null;
	// Named keys (Enter, ArrowUp, F-keys) match by event.code identity and
	// don't need translation — pass the chord through unchanged.
	if (NAMED_KEYS.has(key) || isFunctionKey(key)) return chord;

	// Everything else (letters, digits, punctuation aliases, accented chars)
	// is treated as a logical character lookup. layoutMap.values() are the
	// unshifted glyphs at each physical position; find the scan code whose
	// glyph matches the chord's logical key.
	const targetGlyph = PUNCT_ALIAS_TO_GLYPH[key] ?? key;
	for (const [scanCode, glyph] of layoutMap) {
		if (glyph.toLowerCase() === targetGlyph.toLowerCase()) {
			const translatedKey = normalizeToken(scanCode);
			parts[parts.length - 1] = translatedKey;
			return parts.join("+");
		}
	}
	return null;
}
