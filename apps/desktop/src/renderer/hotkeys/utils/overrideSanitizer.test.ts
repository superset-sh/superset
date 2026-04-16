import { describe, expect, it } from "bun:test";
import { sanitizeOverride } from "./sanitizeOverride";

describe("sanitizeOverride — input shape", () => {
	it("preserves an explicit unassignment (null)", () => {
		expect(sanitizeOverride(null)).toBeNull();
	});

	it("drops empty / non-string values", () => {
		expect(sanitizeOverride(undefined)).toBeUndefined();
		expect(sanitizeOverride("")).toBeUndefined();
		expect(sanitizeOverride("   ")).toBeUndefined();
		expect(sanitizeOverride(42)).toBeUndefined();
		expect(sanitizeOverride({})).toBeUndefined();
	});

	it("drops chords with only modifiers", () => {
		expect(sanitizeOverride("ctrl+shift")).toBeUndefined();
		expect(sanitizeOverride("meta")).toBeUndefined();
	});

	it("drops pre-fix `ctrl+control` garbage (no real key)", () => {
		expect(sanitizeOverride("ctrl+control")).toBeUndefined();
	});
});

describe("sanitizeOverride — identity / canonicalization (already-v2 chords)", () => {
	it("single letter / digit with modifier", () => {
		expect(sanitizeOverride("meta+k")).toBe("meta+k");
		expect(sanitizeOverride("meta+1")).toBe("meta+1");
		expect(sanitizeOverride("meta+d")).toBe("meta+d");
		expect(sanitizeOverride("ctrl+i")).toBe("ctrl+i");
	});

	it("reorders modifiers lexically", () => {
		expect(sanitizeOverride("shift+ctrl+k")).toBe("ctrl+shift+k");
		expect(sanitizeOverride("meta+alt+shift+1")).toBe("alt+meta+shift+1");
	});

	it("aliases arrow tokens to arrow<dir> form", () => {
		expect(sanitizeOverride("meta+alt+up")).toBe("alt+meta+arrowup");
		expect(sanitizeOverride("meta+alt+left")).toBe("alt+meta+arrowleft");
	});

	it("accepts multi-char event.code-style key names", () => {
		expect(sanitizeOverride("meta+bracketleft")).toBe("meta+bracketleft");
		expect(sanitizeOverride("alt+bracketleft")).toBe("alt+bracketleft");
		expect(sanitizeOverride("meta+slash")).toBe("meta+slash");
		expect(sanitizeOverride("meta+semicolon")).toBe("meta+semicolon");
		expect(sanitizeOverride("meta+shift+semicolon")).toBe(
			"meta+shift+semicolon",
		);
		expect(sanitizeOverride("meta+quote")).toBe("meta+quote");
		expect(sanitizeOverride("meta+minus")).toBe("meta+minus");
		expect(sanitizeOverride("meta+end")).toBe("meta+end");
		expect(sanitizeOverride("meta+pagedown")).toBe("meta+pagedown");
	});

	it("accepts function keys F1–F12", () => {
		expect(sanitizeOverride("f1")).toBe("f1");
		expect(sanitizeOverride("f2")).toBe("f2");
		expect(sanitizeOverride("f10")).toBe("f10");
		expect(sanitizeOverride("f12")).toBe("f12");
		expect(sanitizeOverride("meta+f1")).toBe("meta+f1");
	});
});

describe("sanitizeOverride — v1 punctuation rewrite (unshifted)", () => {
	it("rewrites comma / period / semicolon / quote / backquote", () => {
		expect(sanitizeOverride("meta+,")).toBe("meta+comma");
		expect(sanitizeOverride("meta+.")).toBe("meta+period");
		expect(sanitizeOverride("meta+;")).toBe("meta+semicolon");
		expect(sanitizeOverride("ctrl+'")).toBe("ctrl+quote");
		expect(sanitizeOverride("meta+`")).toBe("meta+backquote");
	});

	it("rewrites minus / equal", () => {
		expect(sanitizeOverride("ctrl+-")).toBe("ctrl+minus");
		expect(sanitizeOverride("meta+-")).toBe("meta+minus");
		expect(sanitizeOverride("meta+=")).toBe("meta+equal");
	});

	it("rewrites brackets / backslash", () => {
		expect(sanitizeOverride("meta+[")).toBe("meta+bracketleft");
		expect(sanitizeOverride("meta+]")).toBe("meta+bracketright");
		expect(sanitizeOverride("meta+\\")).toBe("meta+backslash");
	});
});

describe("sanitizeOverride — v1 shifted-char recovery (US QWERTY)", () => {
	it("recovers shifted digits", () => {
		expect(sanitizeOverride("ctrl+shift+!")).toBe("ctrl+shift+1");
		expect(sanitizeOverride("meta+ctrl+shift+@")).toBe("ctrl+meta+shift+2");
		expect(sanitizeOverride("meta+shift+#")).toBe("meta+shift+3");
		expect(sanitizeOverride("meta+shift+$")).toBe("meta+shift+4");
		expect(sanitizeOverride("meta+shift+%")).toBe("meta+shift+5");
		expect(sanitizeOverride("meta+shift+^")).toBe("meta+shift+6");
		expect(sanitizeOverride("meta+shift+&")).toBe("meta+shift+7");
		expect(sanitizeOverride("meta+shift+*")).toBe("meta+shift+8");
		expect(sanitizeOverride("meta+shift+(")).toBe("meta+shift+9");
		expect(sanitizeOverride("meta+shift+)")).toBe("meta+shift+0");
	});

	it("recovers shifted punctuation", () => {
		expect(sanitizeOverride("meta+shift+_")).toBe("meta+shift+minus");
		expect(sanitizeOverride("meta+shift+{")).toBe("meta+shift+bracketleft");
		expect(sanitizeOverride("meta+shift+}")).toBe("meta+shift+bracketright");
		expect(sanitizeOverride("meta+shift+|")).toBe("meta+shift+backslash");
		expect(sanitizeOverride("meta+shift+:")).toBe("meta+shift+semicolon");
		expect(sanitizeOverride('meta+shift+"')).toBe("meta+shift+quote");
		expect(sanitizeOverride("meta+shift+<")).toBe("meta+shift+comma");
		expect(sanitizeOverride("meta+shift+>")).toBe("meta+shift+period");
		expect(sanitizeOverride("meta+shift+?")).toBe("meta+shift+slash");
		expect(sanitizeOverride("meta+shift+~")).toBe("meta+shift+backquote");
	});
});

describe("sanitizeOverride — numpad-minus hardware edge case", () => {
	// On external keyboards, Shift+NumpadSubtract produces event.key === "-"
	// (shift doesn't affect numpad), so v1 stored "meta+shift+-" instead of
	// the expected "meta+shift+_". Both shapes must converge to the same v2
	// chord so the user's binding survives.
	it("maps shift + unshifted minus to shift+minus", () => {
		expect(sanitizeOverride("meta+shift+-")).toBe("meta+shift+minus");
	});

	it("maps shift + shifted minus (_) to shift+minus (same target)", () => {
		expect(sanitizeOverride("meta+shift+_")).toBe("meta+shift+minus");
	});
});

describe("sanitizeOverride — macOS Option dead-key recovery", () => {
	// Real data: v1 stored Option+<digit|letter> as the resulting glyph
	// because its encoder used event.key. Those chars aren't typeable
	// without Option on any layout, so we can safely map them back.
	it("recovers Option + digit row glyphs", () => {
		expect(sanitizeOverride("meta+alt+¡")).toBe("alt+meta+1");
		expect(sanitizeOverride("meta+alt+™")).toBe("alt+meta+2");
		expect(sanitizeOverride("meta+alt+£")).toBe("alt+meta+3");
		expect(sanitizeOverride("meta+alt+¢")).toBe("alt+meta+4");
		expect(sanitizeOverride("meta+alt+∞")).toBe("alt+meta+5");
		expect(sanitizeOverride("meta+alt+§")).toBe("alt+meta+6");
		expect(sanitizeOverride("meta+alt+¶")).toBe("alt+meta+7");
		expect(sanitizeOverride("meta+alt+•")).toBe("alt+meta+8");
		expect(sanitizeOverride("meta+alt+ª")).toBe("alt+meta+9");
		expect(sanitizeOverride("meta+alt+º")).toBe("alt+meta+0");
	});

	it("recovers Option + letter glyphs", () => {
		expect(sanitizeOverride("meta+alt+å")).toBe("alt+meta+a");
		expect(sanitizeOverride("meta+alt+∂")).toBe("alt+meta+d");
		expect(sanitizeOverride("meta+alt+ç")).toBe("alt+meta+c");
		expect(sanitizeOverride("alt+¬")).toBe("alt+l");
		expect(sanitizeOverride("ctrl+ß")).toBe("ctrl+s");
		expect(sanitizeOverride("meta+alt+Ω")).toBe("alt+meta+z");
	});
});

describe("sanitizeOverride — non-US Mac layout opts out of dead-key recovery", () => {
	// On non-US Mac (German, French, etc.), Option+<letter> produces
	// different glyphs than US, so our US-based dead-key table can't be
	// trusted. Migrator passes assumeUSMacLayout=false and we drop rather
	// than silently rebind to the wrong physical key.
	const nonUS = { assumeUSMacLayout: false };

	it("drops Mac Option digit-row glyphs", () => {
		expect(sanitizeOverride("meta+alt+ª", nonUS)).toBeUndefined();
		expect(sanitizeOverride("meta+alt+™", nonUS)).toBeUndefined();
		expect(sanitizeOverride("meta+alt+¡", nonUS)).toBeUndefined();
	});

	it("drops Mac Option letter glyphs", () => {
		expect(sanitizeOverride("meta+alt+å", nonUS)).toBeUndefined();
		expect(sanitizeOverride("meta+alt+∂", nonUS)).toBeUndefined();
		expect(sanitizeOverride("alt+¬", nonUS)).toBeUndefined();
	});

	it("still rewrites ASCII punctuation and shifted glyphs", () => {
		// Layout-gate only affects Mac Option dead keys — punctuation
		// rewrites are always-on.
		expect(sanitizeOverride("meta+,", nonUS)).toBe("meta+comma");
		expect(sanitizeOverride("meta+ctrl+shift+@", nonUS)).toBe(
			"ctrl+meta+shift+2",
		);
		expect(sanitizeOverride("meta+shift+-", nonUS)).toBe("meta+shift+minus");
	});

	it("still canonicalizes already-v2 chords", () => {
		expect(sanitizeOverride("meta+alt+up", nonUS)).toBe("alt+meta+arrowup");
		expect(sanitizeOverride("f1", nonUS)).toBe("f1");
		expect(sanitizeOverride("meta+bracketleft", nonUS)).toBe(
			"meta+bracketleft",
		);
	});
});

describe("sanitizeOverride — best-effort drops (intractable)", () => {
	it("drops corrupt chords whose key was literal `+` (separator collision)", () => {
		// v1 stored Shift+Equal as "shift++", which splits into empty tokens.
		expect(sanitizeOverride("meta+shift++")).toBeUndefined();
		expect(sanitizeOverride("meta++")).toBeUndefined();
	});

	it("drops unknown non-ASCII glyphs (non-US layouts we can't guess)", () => {
		expect(sanitizeOverride("meta+alt+ü")).toBeUndefined();
		expect(sanitizeOverride("ctrl+é")).toBeUndefined();
	});
});

describe("sanitizeOverride — real captured blobs (integration smoke)", () => {
	// Every override that appeared in the three leveldb / app-state dumps
	// we scanned (indigo-pentaceratops v1.4.7, tray-polling-fix, and the
	// current hotkeys-fixes branch). Locks in the 90% best-effort path.
	const cases: Array<[string, string | null]> = [
		// --- indigo-pentaceratops (v1.4.7, event.key style) ---
		["meta+2", "meta+2"],
		["meta+,", "meta+comma"],
		["meta+;", "meta+semicolon"],
		["ctrl+'", "ctrl+quote"],
		["ctrl+-", "ctrl+minus"],
		["meta+ctrl+shift+@", "ctrl+meta+shift+2"],
		["meta+ctrl+shift+n", "ctrl+meta+shift+n"],
		["meta+shift+n", "meta+shift+n"],
		["meta+d", "meta+d"],
		["meta+1", "meta+1"],
		["meta+alt+left", "alt+meta+arrowleft"],
		["meta+-", "meta+minus"],
		["meta+shift+-", "meta+shift+minus"],
		["meta+shift+slash", "meta+shift+slash"],
		// Mac Option dead-key chars captured in real data
		["meta+alt+ª", "alt+meta+9"],
		["meta+alt+å", "alt+meta+a"],
		["meta+alt+™", "alt+meta+2"],
		// --- tray-polling-fix (v2 new format, variety of named keys) ---
		["meta+alt+1", "alt+meta+1"],
		["meta+alt+equal", "alt+meta+equal"],
		["meta+minus", "meta+minus"],
		["meta+slash", "meta+slash"],
		["meta+semicolon", "meta+semicolon"],
		["meta+shift+semicolon", "meta+shift+semicolon"],
		["meta+quote", "meta+quote"],
		["meta+end", "meta+end"],
		["meta+pagedown", "meta+pagedown"],
		["meta+s", "meta+s"],
		["ctrl+i", "ctrl+i"],
		["ctrl+1", "ctrl+1"],
		// --- hotkeys-fixes (current branch, function-key & modifier mixes) ---
		["alt+shift+2", "alt+shift+2"],
		["meta+9", "meta+9"],
		["f1", "f1"],
		["f2", "f2"],
		["f10", "f10"],
		["meta+f1", "meta+f1"],
		["alt+3", "alt+3"],
		["alt+shift+5", "alt+shift+5"],
		["meta+alt+shift+1", "alt+meta+shift+1"],
		["alt+bracketleft", "alt+bracketleft"],
		["alt+shift+9", "alt+shift+9"],
	];

	for (const [input, expected] of cases) {
		it(`${input} -> ${expected}`, () => {
			expect(sanitizeOverride(input)).toBe(expected);
		});
	}
});
