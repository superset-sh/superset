import { describe, expect, it } from "bun:test";
import { formatHotkeyDisplay, glyphForCode } from "./display";

describe("formatHotkeyDisplay", () => {
	it("formats a mac chord with modifier glyphs and no separator", () => {
		const result = formatHotkeyDisplay("meta+shift+n", "mac");
		expect(result.text).toBe("⌘⇧N");
		expect(result.keys).toEqual(["⌘", "⇧", "N"]);
	});

	it("formats a windows chord with named modifiers and `+` separators", () => {
		const result = formatHotkeyDisplay("ctrl+shift+n", "windows");
		expect(result.text).toBe("Ctrl+Shift+N");
	});

	it("renders short arrow aliases and canonical arrow names identically", () => {
		const short = formatHotkeyDisplay("meta+alt+up", "mac");
		const canonical = formatHotkeyDisplay("alt+meta+arrowup", "mac");
		expect(short.text).toBe("⌘⌥↑");
		expect(canonical.text).toBe("⌘⌥↑");
	});

	it("renders punctuation tokens with their character", () => {
		expect(formatHotkeyDisplay("meta+bracketleft", "mac").text).toBe("⌘[");
		expect(formatHotkeyDisplay("meta+comma", "mac").text).toBe("⌘,");
		expect(formatHotkeyDisplay("ctrl+backslash", "linux").text).toBe("Ctrl+\\");
		expect(formatHotkeyDisplay("ctrl+slash", "linux").text).toBe("Ctrl+/");
	});

	it("treats `control` as `ctrl`", () => {
		const result = formatHotkeyDisplay("control+k", "windows");
		expect(result.text).toBe("Ctrl+K");
	});

	it("returns Unassigned for null or chords with no key token", () => {
		expect(formatHotkeyDisplay(null, "mac")).toEqual({
			keys: ["Unassigned"],
			text: "Unassigned",
		});
		expect(formatHotkeyDisplay("meta", "mac")).toEqual({
			keys: ["Unassigned"],
			text: "Unassigned",
		});
	});
});

describe("glyphForCode", () => {
	const usMap = new Map<string, string>([
		["KeyA", "a"],
		["KeyZ", "z"],
		["Slash", "/"],
		["Quote", "'"],
		["Digit5", "5"],
	]);
	const qwertzMap = new Map<string, string>([
		["KeyA", "a"],
		["KeyZ", "y"], // QWERTZ — Y/Z swapped
		["Slash", "-"],
		["Quote", "ä"],
	]);

	it("returns null when no layout map provided", () => {
		expect(glyphForCode("z", null)).toBeNull();
	});

	it("returns the printed glyph for a letter on the current layout", () => {
		expect(glyphForCode("a", usMap)).toBe("A");
		expect(glyphForCode("z", usMap)).toBe("Z");
		expect(glyphForCode("z", qwertzMap)).toBe("Y");
	});

	it("returns the printed glyph for digits", () => {
		expect(glyphForCode("5", usMap)).toBe("5");
	});

	it("returns the printed glyph for punctuation tokens", () => {
		expect(glyphForCode("slash", usMap)).toBe("/");
		expect(glyphForCode("slash", qwertzMap)).toBe("-");
	});

	it("returns null for special keys that don't have a printable glyph", () => {
		expect(glyphForCode("enter", usMap)).toBeNull();
		expect(glyphForCode("arrowup", usMap)).toBeNull();
		expect(glyphForCode("escape", usMap)).toBeNull();
		expect(glyphForCode("f5", usMap)).toBeNull();
	});

	it("returns null when the layout map has no entry for the code", () => {
		expect(glyphForCode("z", new Map())).toBeNull();
	});

	it("returns null for multi-character (composing) glyphs", () => {
		const composing = new Map<string, string>([["KeyA", "ʼa"]]);
		expect(glyphForCode("a", composing)).toBeNull();
	});

	it("preserves non-ASCII glyphs that would expand on uppercase (ß, ı)", () => {
		// "ß".toUpperCase() === "SS" in JS — would break single-keycap display
		const german = new Map<string, string>([["KeyS", "ß"]]);
		expect(glyphForCode("s", german)).toBe("ß");
		const turkish = new Map<string, string>([["KeyI", "ı"]]);
		expect(glyphForCode("i", turkish)).toBe("ı");
	});
});

describe("formatHotkeyDisplay — layout-aware", () => {
	const usMap = new Map<string, string>([
		["KeyZ", "z"],
		["Slash", "/"],
		["BracketLeft", "["],
	]);
	const qwertzMap = new Map<string, string>([
		["KeyZ", "y"],
		["Slash", "-"],
	]);

	it("uses the layout glyph for printable keys when a map is provided", () => {
		expect(formatHotkeyDisplay("meta+z", "mac", qwertzMap).text).toBe("⌘Y");
		expect(formatHotkeyDisplay("ctrl+slash", "linux", qwertzMap).text).toBe(
			"Ctrl+-",
		);
	});

	it("falls back to KEY_DISPLAY when layoutMap is null (regression — current behavior)", () => {
		expect(formatHotkeyDisplay("meta+z", "mac", null).text).toBe("⌘Z");
		expect(formatHotkeyDisplay("ctrl+slash", "linux", null).text).toBe(
			"Ctrl+/",
		);
	});

	it("matches today's output for a US-equivalent map (no visible change)", () => {
		expect(formatHotkeyDisplay("meta+z", "mac").text).toBe(
			formatHotkeyDisplay("meta+z", "mac", usMap).text,
		);
		expect(formatHotkeyDisplay("ctrl+slash", "linux").text).toBe(
			formatHotkeyDisplay("ctrl+slash", "linux", usMap).text,
		);
	});

	it("special keys ignore layoutMap and keep their symbol", () => {
		// Even if a malicious map tried to remap "Enter", we ignore it for
		// special keys since glyphForCode returns null for them.
		const weird = new Map<string, string>([["Enter", "X"]]);
		expect(formatHotkeyDisplay("meta+enter", "mac", weird).text).toBe("⌘↵");
	});

	it("falls back to KEY_DISPLAY when layoutMap is missing the code (e.g. Numpad)", () => {
		expect(formatHotkeyDisplay("meta+bracketleft", "mac", qwertzMap).text).toBe(
			"⌘[",
		);
	});
});
