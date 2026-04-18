import { afterEach, describe, expect, mock, test } from "bun:test";
import {
	DEFAULT_TERMINAL_FONT_FAMILY,
	sanitizeTerminalFontFamily,
} from "./index";

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

	test("trusts all-generic monospace values without canvas", () => {
		expect(sanitizeTerminalFontFamily("monospace")).toBe("monospace");
		expect(sanitizeTerminalFontFamily("ui-monospace")).toBe("ui-monospace");
	});

	test("falls back for proportional generic families", () => {
		// No primary concrete family to measure, and the stack isn't all-mono —
		// pre-regression these slipped through and could still blank the terminal.
		expect(sanitizeTerminalFontFamily("sans-serif")).toBe(
			DEFAULT_TERMINAL_FONT_FAMILY,
		);
		expect(sanitizeTerminalFontFamily("serif")).toBe(
			DEFAULT_TERMINAL_FONT_FAMILY,
		);
		expect(sanitizeTerminalFontFamily("cursive")).toBe(
			DEFAULT_TERMINAL_FONT_FAMILY,
		);
		expect(sanitizeTerminalFontFamily("monospace, sans-serif")).toBe(
			DEFAULT_TERMINAL_FONT_FAMILY,
		);
	});

	test("passes a monospace font through (canvas reports equal widths)", () => {
		restore = stubCanvas(() => equalWidths);
		expect(sanitizeTerminalFontFamily('"JetBrains Mono", monospace')).toBe(
			'"JetBrains Mono", monospace',
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
			'"UnmeasurableFont-ABC-123"',
		);
	});
});
