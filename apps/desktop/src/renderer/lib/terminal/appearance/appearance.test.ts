import { afterEach, describe, expect, mock, test } from "bun:test";
import {
	DEFAULT_TERMINAL_FONT_FAMILY,
	NERD_FONT_FALLBACK_FAMILIES,
	resolveTerminalAppearance,
	sanitizeTerminalFontFamily,
} from "./index";

/** Quoted nerd-font fallback tail, minus families already in the stack. */
function nerdTail(...present: string[]): string {
	const lower = new Set(present.map((f) => f.toLowerCase()));
	return NERD_FONT_FALLBACK_FAMILIES.filter((f) => !lower.has(f.toLowerCase()))
		.map((f) => `"${f}"`)
		.join(", ");
}

type MeasureFn = (text: string) => { width: number };

/**
 * Stub `document.createElement("canvas")` so `getContext("2d").measureText`
 * returns widths from `measureForFont`. Non-canvas tags defer to the
 * existing test-setup stub.
 */
function stubCanvas(measureForFont: (font: string) => MeasureFn) {
	const originalCreate = document.createElement;
	// biome-ignore lint/suspicious/noExplicitAny: bun:test `mock` wraps arbitrary fns
	(document as any).createElement = mock((tag: string) => {
		if (tag !== "canvas") {
			// biome-ignore lint/suspicious/noExplicitAny: delegating stub accepts any tag
			return (originalCreate as any).call(document, tag);
		}
		let currentFont = "";
		return {
			getContext: (kind: string) => {
				if (kind !== "2d") return null;
				return {
					set font(value: string) {
						currentFont = value;
					},
					get font() {
						return currentFont;
					},
					measureText: (text: string) => measureForFont(currentFont)(text),
				};
			},
		};
	});
	return () => {
		// biome-ignore lint/suspicious/noExplicitAny: restoring stubbed method
		(document as any).createElement = originalCreate;
	};
}

const equalWidths: MeasureFn = (text) => ({ width: text.length * 10 });
const proportionalWidths: MeasureFn = (text) => {
	let width = 0;
	for (const ch of text) width += ch === "M" ? 16 : 6;
	return { width };
};

describe("sanitizeTerminalFontFamily", () => {
	let restore: (() => void) | null = null;

	afterEach(() => {
		restore?.();
		restore = null;
	});

	test("returns default for null / empty / whitespace", () => {
		expect(sanitizeTerminalFontFamily(null)).toBe(DEFAULT_TERMINAL_FONT_FAMILY);
		expect(sanitizeTerminalFontFamily(undefined)).toBe(
			DEFAULT_TERMINAL_FONT_FAMILY,
		);
		expect(sanitizeTerminalFontFamily("")).toBe(DEFAULT_TERMINAL_FONT_FAMILY);
		expect(sanitizeTerminalFontFamily("   ")).toBe(
			DEFAULT_TERMINAL_FONT_FAMILY,
		);
	});

	test("trusts generic monospace primaries without canvas, adding icon fallbacks after them", () => {
		expect(sanitizeTerminalFontFamily("monospace")).toBe(
			`monospace, ${nerdTail()}`,
		);
		expect(sanitizeTerminalFontFamily("ui-monospace")).toBe(
			`ui-monospace, ${nerdTail()}`,
		);
	});

	test("falls back when the primary family is a proportional generic", () => {
		expect(sanitizeTerminalFontFamily("sans-serif")).toBe(
			DEFAULT_TERMINAL_FONT_FAMILY,
		);
		expect(sanitizeTerminalFontFamily("serif")).toBe(
			DEFAULT_TERMINAL_FONT_FAMILY,
		);
		expect(sanitizeTerminalFontFamily("cursive")).toBe(
			DEFAULT_TERMINAL_FONT_FAMILY,
		);
		// CSS resolves the first generic, so a later monospace entry never wins.
		expect(sanitizeTerminalFontFamily("cursive, monospace")).toBe(
			DEFAULT_TERMINAL_FONT_FAMILY,
		);
	});

	test("keeps a generic monospace primary first, fallbacks after it", () => {
		// The browser resolves the first generic, so "monospace, sans-serif"
		// actually renders as monospace — safe; icon fallbacks slot in behind it.
		expect(sanitizeTerminalFontFamily("monospace, sans-serif")).toBe(
			`monospace, ${nerdTail()}, sans-serif`,
		);
	});

	test("falls back when a concrete mono follows a proportional generic", () => {
		// Regression: earlier logic picked the first non-generic as the primary,
		// letting `sans-serif, "JetBrains Mono"` slip through even though CSS
		// renders sans-serif. Validate the actual CSS primary instead.
		expect(sanitizeTerminalFontFamily('sans-serif, "JetBrains Mono"')).toBe(
			DEFAULT_TERMINAL_FONT_FAMILY,
		);
	});

	test("inserts nerd-font fallbacks before an existing monospace tail", () => {
		restore = stubCanvas(() => equalWidths);
		expect(sanitizeTerminalFontFamily('"JetBrains Mono", monospace')).toBe(
			`"JetBrains Mono", ${nerdTail()}, monospace`,
		);
	});

	test("appends nerd-font fallbacks and a monospace tail to a bare family", () => {
		// The fallbacks keep PUA icons (eza --icons, starship) rendering when the
		// chosen font lacks the glyphs; the generic tail keeps an uninstalled
		// primary from resolving to a proportional default.
		restore = stubCanvas(() => equalWidths);
		expect(sanitizeTerminalFontFamily('"JetBrains Mono"')).toBe(
			`"JetBrains Mono", ${nerdTail()}, monospace`,
		);
		expect(sanitizeTerminalFontFamily("Menlo")).toBe(
			`"Menlo", ${nerdTail()}, monospace`,
		);
	});

	test("escapes backslashes and quotes so any name serializes to valid CSS", () => {
		restore = stubCanvas(() => equalWidths);
		expect(sanitizeTerminalFontFamily("Trailing\\")).toBe(
			`"Trailing\\\\", ${nerdTail()}, monospace`,
		);
	});

	test("quotes families that are invalid as unquoted CSS idents", () => {
		// "0xProto Nerd Font" starts with a digit — unquoted it invalidates the
		// whole font-family value, so canvas `ctx.font` silently keeps its default
		// and the WebGL atlas rasterizes tofu for every icon (SUPER-1782).
		restore = stubCanvas(() => equalWidths);
		expect(sanitizeTerminalFontFamily("0xProto Nerd Font")).toBe(
			`"0xProto Nerd Font", ${nerdTail()}, monospace`,
		);
	});

	test("does not duplicate a chosen family that is already a fallback", () => {
		restore = stubCanvas(() => equalWidths);
		expect(sanitizeTerminalFontFamily("Hack Nerd Font")).toBe(
			`"Hack Nerd Font", ${nerdTail("Hack Nerd Font")}, monospace`,
		);
	});

	test("appends detected installed Nerd Fonts after the well-known fallbacks", () => {
		restore = stubCanvas(() => equalWidths);
		expect(
			sanitizeTerminalFontFamily("Menlo", [
				"0xProto Nerd Font Mono",
				"Hack Nerd Font", // already a well-known fallback — not duplicated
			]),
		).toBe(`"Menlo", ${nerdTail()}, "0xProto Nerd Font Mono", monospace`);
	});

	test("includes detected installed Nerd Fonts in the default stack", () => {
		expect(sanitizeTerminalFontFamily(null, ["0xProto Nerd Font Mono"])).toBe(
			DEFAULT_TERMINAL_FONT_FAMILY.replace(
				", monospace",
				', "0xProto Nerd Font Mono", monospace',
			),
		);
	});

	test("falls back to default for a proportional primary family (quoted)", () => {
		restore = stubCanvas(() => proportionalWidths);
		expect(sanitizeTerminalFontFamily('"Inter", sans-serif')).toBe(
			DEFAULT_TERMINAL_FONT_FAMILY,
		);
	});

	test("falls back to default for a proportional primary family (bare)", () => {
		restore = stubCanvas(() => proportionalWidths);
		expect(sanitizeTerminalFontFamily("Inter")).toBe(
			DEFAULT_TERMINAL_FONT_FAMILY,
		);
	});

	test("trusts the value when canvas measurement throws", () => {
		restore = stubCanvas(() => () => {
			throw new Error("canvas unsupported");
		});
		// Use a unique family so the module-level monospace cache doesn't mask
		// the canvas error path.
		expect(sanitizeTerminalFontFamily('"UnmeasurableFont-ABC-123"')).toBe(
			`"UnmeasurableFont-ABC-123", ${nerdTail()}, monospace`,
		);
	});
});

describe("resolveTerminalAppearance", () => {
	test("preserves the existing terminal rendering defaults", () => {
		const theme = { background: "#111111", foreground: "#eeeeee" };
		expect(resolveTerminalAppearance(theme)).toEqual({
			theme,
			background: "#111111",
			fontFamily: DEFAULT_TERMINAL_FONT_FAMILY,
			fontSize: 14,
			lineHeight: 1,
			letterSpacing: 0,
			fontWeight: "normal",
			ligatures: true,
			minimumContrastRatio: 1,
			cursorStyle: "block",
			cursorBlink: true,
		});
	});

	test("maps every persisted override to xterm appearance", () => {
		const theme = { background: "#000000" };
		const appearance = resolveTerminalAppearance(theme, {
			terminalFontFamily: "monospace",
			terminalFontSize: 15.5,
			terminalLineHeight: 1.3,
			terminalLetterSpacing: 0.5,
			terminalFontWeight: 500,
			terminalLigatures: false,
			terminalMinimumContrast: 4.5,
			terminalCursorStyle: "underline",
			terminalCursorBlink: false,
		});

		expect(appearance).toMatchObject({
			fontFamily: `monospace, ${nerdTail()}`,
			fontSize: 15.5,
			lineHeight: 1.3,
			letterSpacing: 0.5,
			fontWeight: 500,
			ligatures: false,
			minimumContrastRatio: 4.5,
			cursorStyle: "underline",
			cursorBlink: false,
		});
	});
});
