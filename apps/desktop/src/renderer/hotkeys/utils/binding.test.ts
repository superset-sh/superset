import { describe, expect, it } from "bun:test";
import {
	bindingsEqual,
	bindingToDispatchChord,
	defaultModeForChord,
	parseBinding,
	serializeBinding,
	translateLogicalChord,
} from "./binding";

describe("defaultModeForChord", () => {
	it("classifies named keys as 'named'", () => {
		expect(defaultModeForChord("meta+enter")).toBe("named");
		expect(defaultModeForChord("ctrl+arrowup")).toBe("named");
		expect(defaultModeForChord("alt+up")).toBe("named");
		expect(defaultModeForChord("escape")).toBe("named");
		expect(defaultModeForChord("backspace")).toBe("named");
	});

	it("classifies F-keys as 'named'", () => {
		expect(defaultModeForChord("f1")).toBe("named");
		expect(defaultModeForChord("meta+f10")).toBe("named");
		expect(defaultModeForChord("f12")).toBe("named");
	});

	it("classifies letters/digits/punctuation as 'physical'", () => {
		expect(defaultModeForChord("meta+p")).toBe("physical");
		expect(defaultModeForChord("ctrl+shift+1")).toBe("physical");
		expect(defaultModeForChord("meta+slash")).toBe("physical");
		expect(defaultModeForChord("ctrl+bracketleft")).toBe("physical");
	});
});

describe("parseBinding", () => {
	it("treats legacy string as physical for printable keys", () => {
		expect(parseBinding("meta+p")).toEqual({
			mode: "physical",
			chord: "meta+p",
		});
	});

	it("treats legacy string as named for special keys", () => {
		expect(parseBinding("meta+enter")).toEqual({
			mode: "named",
			chord: "meta+enter",
		});
		expect(parseBinding("f5")).toEqual({ mode: "named", chord: "f5" });
	});

	it("preserves explicit v2 object form", () => {
		expect(
			parseBinding({ version: 2, mode: "logical", chord: "meta+p" }),
		).toEqual({ mode: "logical", chord: "meta+p" });
		expect(
			parseBinding({ version: 2, mode: "physical", chord: "meta+p" }),
		).toEqual({ mode: "physical", chord: "meta+p" });
	});
});

describe("serializeBinding", () => {
	it("compacts physical mode to bare string (matches legacy storage)", () => {
		expect(serializeBinding({ mode: "physical", chord: "meta+p" })).toBe(
			"meta+p",
		);
	});

	it("encodes logical mode as v2 object", () => {
		expect(serializeBinding({ mode: "logical", chord: "meta+p" })).toEqual({
			version: 2,
			mode: "logical",
			chord: "meta+p",
		});
	});

	it("encodes named mode as v2 object", () => {
		expect(serializeBinding({ mode: "named", chord: "meta+enter" })).toEqual({
			version: 2,
			mode: "named",
			chord: "meta+enter",
		});
	});

	it("canonicalizes the chord on serialize", () => {
		expect(serializeBinding({ mode: "physical", chord: "shift+ctrl+k" })).toBe(
			"ctrl+shift+k",
		);
	});

	it("round-trips legacy physical bindings unchanged", () => {
		const legacy: string = "meta+shift+p";
		const round = serializeBinding(parseBinding(legacy));
		expect(round).toBe(legacy);
	});

	it("round-trips logical bindings as v2 objects", () => {
		const v2 = {
			version: 2 as const,
			mode: "logical" as const,
			chord: "meta+p",
		};
		const round = serializeBinding(parseBinding(v2));
		expect(round).toEqual(v2);
	});
});

describe("translateLogicalChord", () => {
	const usMap = new Map<string, string>([
		["KeyA", "a"],
		["KeyP", "p"],
		["KeyR", "r"],
		["KeyZ", "z"],
		["Slash", "/"],
		["Quote", "'"],
		["Semicolon", ";"],
	]);
	// Dvorak: physical KeyR position prints "p", physical KeyP prints "l"
	const dvorakMap = new Map<string, string>([
		["KeyA", "a"],
		["KeyP", "l"],
		["KeyR", "p"],
		["KeyZ", ";"],
		["Quote", "q"],
	]);
	// QWERTZ: KeyY/KeyZ swapped, Slash → "-"
	const qwertzMap = new Map<string, string>([
		["KeyY", "z"],
		["KeyZ", "y"],
		["Slash", "-"],
	]);

	it("returns null when layout map is unavailable", () => {
		expect(translateLogicalChord("meta+p", null)).toBeNull();
	});

	it("US layout: chord round-trips unchanged", () => {
		expect(translateLogicalChord("meta+p", usMap)).toBe("meta+p");
		expect(translateLogicalChord("ctrl+shift+a", usMap)).toBe("ctrl+shift+a");
	});

	it("Dvorak: meta+p (logical) translates to meta+r (physical R prints 'p')", () => {
		expect(translateLogicalChord("meta+p", dvorakMap)).toBe("meta+r");
	});

	it("QWERTZ: meta+y (logical) translates to meta+z (physical Z prints 'y')", () => {
		expect(translateLogicalChord("meta+y", qwertzMap)).toBe("meta+z");
	});

	it("translates punctuation aliases via their US glyph", () => {
		// US: Slash prints "/" → no change
		expect(translateLogicalChord("ctrl+slash", usMap)).toBe("ctrl+slash");
		// QWERTZ: Slash prints "-", but the binding wants the "/" character.
		// On QWERTZ "/" is at Shift+7, not on a single key — so no scan code
		// has unshifted glyph "/", returns null (caller falls back).
		expect(translateLogicalChord("ctrl+slash", qwertzMap)).toBeNull();
	});

	it("named keys (Enter, ArrowUp, F-keys) pass through unchanged", () => {
		expect(translateLogicalChord("meta+enter", dvorakMap)).toBe("meta+enter");
		expect(translateLogicalChord("ctrl+arrowup", dvorakMap)).toBe(
			"ctrl+arrowup",
		);
		expect(translateLogicalChord("f5", dvorakMap)).toBe("f5");
	});

	it("returns null when the produced character isn't on the keyboard", () => {
		// Logical "meta+ñ" — no scan code in usMap has "ñ" as unshifted glyph
		expect(translateLogicalChord("meta+ñ", usMap)).toBeNull();
	});

	it("preserves modifier order from the input chord", () => {
		// Verify modifiers stay in their input order; canonicalizeChord sorts them
		const result = translateLogicalChord("alt+meta+shift+p", dvorakMap);
		expect(result).toBe("alt+meta+shift+r");
	});
});

describe("bindingToDispatchChord", () => {
	const usMap = new Map<string, string>([
		["KeyP", "p"],
		["KeyR", "r"],
		["KeyY", "y"],
		["KeyZ", "z"],
	]);
	// QWERTZ: Y/Z swapped
	const qwertzMap = new Map<string, string>([
		["KeyY", "z"],
		["KeyZ", "y"],
	]);

	it("returns null for null binding", () => {
		expect(bindingToDispatchChord(null, usMap)).toBeNull();
	});

	it("legacy string (physical) returns chord unchanged", () => {
		expect(bindingToDispatchChord("meta+p", usMap)).toBe("meta+p");
		expect(bindingToDispatchChord("meta+p", qwertzMap)).toBe("meta+p");
	});

	it("explicit physical mode returns chord unchanged", () => {
		expect(
			bindingToDispatchChord(
				{ version: 2, mode: "physical", chord: "meta+p" },
				qwertzMap,
			),
		).toBe("meta+p");
	});

	it("named mode returns chord unchanged", () => {
		expect(
			bindingToDispatchChord(
				{ version: 2, mode: "named", chord: "meta+enter" },
				qwertzMap,
			),
		).toBe("meta+enter");
	});

	// The bug we just fixed: logical bindings recorded on QWERTZ were displayed
	// as if their key were a scan-code token. Verify the translation flips the
	// chord to the equivalent event.code form before display/dispatch.
	it("logical binding on QWERTZ: meta+z translates to meta+y (KeyY prints 'z')", () => {
		expect(
			bindingToDispatchChord(
				{ version: 2, mode: "logical", chord: "meta+z" },
				qwertzMap,
			),
		).toBe("meta+y");
	});

	it("logical binding on QWERTZ: meta+y translates to meta+z (KeyZ prints 'y')", () => {
		expect(
			bindingToDispatchChord(
				{ version: 2, mode: "logical", chord: "meta+y" },
				qwertzMap,
			),
		).toBe("meta+z");
	});

	it("logical binding on US: identity (printed char == scan-code token)", () => {
		expect(
			bindingToDispatchChord(
				{ version: 2, mode: "logical", chord: "meta+z" },
				usMap,
			),
		).toBe("meta+z");
	});

	it("logical binding falls back to literal chord when layoutMap missing", () => {
		expect(
			bindingToDispatchChord(
				{ version: 2, mode: "logical", chord: "meta+z" },
				null,
			),
		).toBe("meta+z");
	});
});

describe("bindingsEqual", () => {
	it("nulls match nulls", () => {
		expect(bindingsEqual(null, null)).toBe(true);
		expect(bindingsEqual(null, "meta+p")).toBe(false);
		expect(bindingsEqual("meta+p", null)).toBe(false);
	});

	it("legacy string matches itself across modifier reorderings", () => {
		expect(bindingsEqual("meta+shift+p", "shift+meta+p")).toBe(true);
	});

	it("legacy physical does NOT equal explicit logical with same chord", () => {
		expect(
			bindingsEqual("meta+p", { version: 2, mode: "logical", chord: "meta+p" }),
		).toBe(false);
	});

	it("legacy physical equals explicit physical with same chord", () => {
		expect(
			bindingsEqual("meta+p", {
				version: 2,
				mode: "physical",
				chord: "meta+p",
			}),
		).toBe(true);
	});

	it("two logical bindings with equivalent chords match", () => {
		expect(
			bindingsEqual(
				{ version: 2, mode: "logical", chord: "shift+meta+p" },
				{ version: 2, mode: "logical", chord: "meta+shift+p" },
			),
		).toBe(true);
	});
});
