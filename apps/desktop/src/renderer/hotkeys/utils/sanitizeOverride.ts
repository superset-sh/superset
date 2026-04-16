import { canonicalizeChord, MODIFIERS } from "./resolveHotkeyFromEvent";

// v1 stored tokens via event.key; v2 matches via event.code. These maps
// rewrite raw glyphs to v2's code names where the mapping is unambiguous.

// Always safe: US-ANSI punctuation + shifted glyphs. The `event.code`
// position of these keys is consistent across Latin layouts (AZERTY is the
// edge case — rare enough to accept the occasional drop).
const ALWAYS_SAFE_REWRITES: Record<string, string> = {
	",": "comma",
	".": "period",
	";": "semicolon",
	"'": "quote",
	"`": "backquote",
	"-": "minus",
	"=": "equal",
	"[": "bracketleft",
	"]": "bracketright",
	"\\": "backslash",
	"/": "slash",
	"!": "1",
	"@": "2",
	"#": "3",
	$: "4",
	"%": "5",
	"^": "6",
	"&": "7",
	"*": "8",
	"(": "9",
	")": "0",
	_: "minus",
	"{": "bracketleft",
	"}": "bracketright",
	"|": "backslash",
	":": "semicolon",
	'"': "quote",
	"<": "comma",
	">": "period",
	"?": "slash",
	"~": "backquote",
};

// macOS Option+<digit|letter> glyphs on **US** layout. On German Mac,
// Option+Q produces `•` (which US maps to Option+8) — same glyph, different
// physical key. Gated behind a US-layout detection in migrate.ts to avoid
// silently rewriting bindings to the wrong physical key on non-US Macs.
const MAC_US_DEAD_KEYS: Record<string, string> = {
	"¡": "1",
	"™": "2",
	"£": "3",
	"¢": "4",
	"∞": "5",
	"§": "6",
	"¶": "7",
	"•": "8",
	ª: "9",
	º: "0",
	å: "a",
	"∫": "b",
	ç: "c",
	"∂": "d",
	ƒ: "f",
	"©": "g",
	"˙": "h",
	"∆": "j",
	"˚": "k",
	"¬": "l",
	µ: "m",
	ø: "o",
	π: "p",
	œ: "q",
	"®": "r",
	ß: "s",
	"†": "t",
	"√": "v",
	"∑": "w",
	"≈": "x",
	"¥": "y",
	Ω: "z",
};

export interface SanitizeOverrideOptions {
	/** Apply US-Mac Option dead-key rewrites. Caller should pass `false` when
	 * the current keyboard layout is not US-compatible. Default `true`. */
	assumeUSMacLayout?: boolean;
}

/**
 * Validates a migrated override string. Drops pre-fix garbage
 * (`ctrl+control`, modifier-only chords, unknown non-ASCII glyphs) that the
 * old recorder could produce and that would never match `event.code`-based
 * dispatch.
 *
 * - Returns the canonicalized chord on success.
 * - Returns `null` to preserve an explicit unassignment.
 * - Returns `undefined` to signal the caller should drop the entry.
 */
export function sanitizeOverride(
	value: unknown,
	options: SanitizeOverrideOptions = {},
): string | null | undefined {
	if (value === null) return null;
	if (typeof value !== "string" || !value.trim()) return undefined;
	const { assumeUSMacLayout = true } = options;
	const rewritten = value
		.split("+")
		.map((part) => {
			const safe = ALWAYS_SAFE_REWRITES[part];
			if (safe) return safe;
			if (assumeUSMacLayout) {
				const deadKey = MAC_US_DEAD_KEYS[part];
				if (deadKey) return deadKey;
			}
			return part;
		})
		.join("+");
	const canonical = canonicalizeChord(rewritten);
	const keys = canonical.split("+").filter((p) => !MODIFIERS.has(p));
	if (keys.length !== 1 || !/^[a-z0-9]+$/.test(keys[0])) return undefined;
	return canonical;
}
