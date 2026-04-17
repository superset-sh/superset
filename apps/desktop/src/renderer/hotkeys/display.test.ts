import { describe, expect, it } from "bun:test";
import { formatHotkeyDisplay } from "./display";

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
