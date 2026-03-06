import { describe, expect, it } from "bun:test";
import {
	appendTerminalIconFallback,
	formatCssFontFamilyList,
	resolveTerminalFontFamily,
	TERMINAL_ICON_FALLBACK_FAMILY,
} from "./font-family";
import { BUNDLED_TERMINAL_FONT_FAMILY } from "./fonts";

describe("terminal font-family helpers", () => {
	it("formats spaced font family names as valid CSS lists", () => {
		expect(formatCssFontFamilyList("MesloLGM Nerd Font Mono, monospace")).toBe(
			'"MesloLGM Nerd Font Mono", monospace',
		);
	});

	it("appends the terminal icon fallback only once", () => {
		expect(appendTerminalIconFallback("Menlo, monospace")).toBe(
			`Menlo, monospace, "${TERMINAL_ICON_FALLBACK_FAMILY}"`,
		);
		expect(
			appendTerminalIconFallback(`Menlo, "${TERMINAL_ICON_FALLBACK_FAMILY}"`),
		).toBe(`Menlo, "${TERMINAL_ICON_FALLBACK_FAMILY}"`);
	});

	it("preserves generic families while adding icon fallback", () => {
		expect(resolveTerminalFontFamily("monospace", 14)).toBe(
			`monospace, "${TERMINAL_ICON_FALLBACK_FAMILY}"`,
		);
	});

	it("keeps the bundled terminal font family as the resolved default", () => {
		expect(resolveTerminalFontFamily(BUNDLED_TERMINAL_FONT_FAMILY, 14)).toBe(
			`"${BUNDLED_TERMINAL_FONT_FAMILY}"`,
		);
	});
});
