import { describe, expect, it } from "bun:test";
import { DEFAULT_TERMINAL_FONT_FAMILY } from "./config";
import { resolveTerminalFontFamily } from "./font-family";
import { BUNDLED_TERMINAL_FONT_FAMILY } from "./fonts";

describe("resolveTerminalFontFamily", () => {
	it("returns the bundled default stack when no custom font is configured", () => {
		expect(resolveTerminalFontFamily(null)).toBe(DEFAULT_TERMINAL_FONT_FAMILY);
	});

	it("appends the bundled terminal stack behind custom fonts", () => {
		expect(resolveTerminalFontFamily("Berkeley Mono")).toBe(
			`Berkeley Mono, ${DEFAULT_TERMINAL_FONT_FAMILY}`,
		);
	});

	it("does not append the bundled family twice", () => {
		const value = `"${BUNDLED_TERMINAL_FONT_FAMILY}", monospace`;
		expect(resolveTerminalFontFamily(value)).toBe(value);
	});
});
