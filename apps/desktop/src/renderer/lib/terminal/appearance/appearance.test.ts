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

	test("passes through a stack whose primary generic is monospace", () => {
		// The browser resolves the first generic, so "monospace, sans-serif"
		// actually renders as monospace — safe.
		expect(sanitizeTerminalFontFamily("monospace, sans-serif")).toBe(
			"monospace, sans-serif",
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

	test("passes a monospace font through when the stack already ends with monospace", () => {
		restore = stubCanvas(() => equalWidths);
		expect(sanitizeTerminalFontFamily('"JetBrains Mono", monospace')).toBe(
			'"JetBrains Mono", monospace',
		);
	});

	test("appends a monospace fallback when the stack lacks one", () => {
		// If the primary isn't installed, the browser otherwise falls back to a
		// proportional default — appending "monospace" forces OS monospace.
		restore = stubCanvas(() => equalWidths);
		expect(sanitizeTerminalFontFamily('"JetBrains Mono"')).toBe(
			'"JetBrains Mono", monospace',
		);
		expect(sanitizeTerminalFontFamily("Menlo")).toBe("Menlo, monospace");
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
			'"UnmeasurableFont-ABC-123", monospace',
		);
	});
});
