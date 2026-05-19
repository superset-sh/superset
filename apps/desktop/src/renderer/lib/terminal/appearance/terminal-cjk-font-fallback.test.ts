import { afterEach, describe, expect, mock, test } from "bun:test";
import {
	DEFAULT_TERMINAL_FONT_FAMILY,
	sanitizeTerminalFontFamily,
	TERMINAL_CJK_FALLBACK_FONT_FAMILIES,
} from "./index";

type MeasureFn = (text: string) => { width: number };

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

describe("terminal CJK font fallback", () => {
	let restore: (() => void) | null = null;

	afterEach(() => {
		restore?.();
		restore = null;
	});

	test("keeps CJK fallbacks ahead of generic monospace for Source Code Pro", () => {
		restore = stubCanvas(() => equalWidths);

		const result = sanitizeTerminalFontFamily('"Source Code Pro", monospace');

		for (const family of TERMINAL_CJK_FALLBACK_FONT_FAMILIES) {
			expect(result).toContain(`"${family}"`);
		}
		expect(result).toMatch(
			/^"Source Code Pro", "Noto Sans Mono CJK SC".*, monospace$/,
		);
	});

	test("does not duplicate an existing CJK fallback", () => {
		restore = stubCanvas(() => equalWidths);

		const result = sanitizeTerminalFontFamily(
			'"Source Code Pro", "PingFang SC", monospace',
		);

		expect(result.match(/"PingFang SC"/g)?.length).toBe(1);
	});

	test("keeps CJK fallbacks before proportional generic fallbacks", () => {
		restore = stubCanvas(() => equalWidths);

		const result = sanitizeTerminalFontFamily('"Source Code Pro", sans-serif');

		expect(result.indexOf('"Noto Sans Mono CJK SC"')).toBeLessThan(
			result.indexOf("sans-serif"),
		);
	});

	test("default terminal stack includes explicit CJK fallbacks", () => {
		for (const family of TERMINAL_CJK_FALLBACK_FONT_FAMILIES) {
			expect(DEFAULT_TERMINAL_FONT_FAMILY).toContain(`"${family}"`);
		}
	});
});
