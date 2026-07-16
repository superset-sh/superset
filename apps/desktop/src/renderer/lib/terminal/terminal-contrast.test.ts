import { describe, expect, test } from "bun:test";
import { type ITheme, Terminal as XTerm } from "@xterm/xterm";
import { TERMINAL_OPTIONS } from "renderer/screens/main/components/WorkspaceView/ContentView/TabsContent/Terminal/config";
import {
	applyTerminalTheme,
	TERMINAL_MINIMUM_CONTRAST_RATIO,
} from "./appearance";
import { buildTerminalOptions } from "./terminal-runtime";

type Rgb = readonly [number, number, number];

function relativeLuminance([red, green, blue]: Rgb): number {
	return [red, green, blue]
		.map((channel) => {
			const value = channel / 255;
			return value <= 0.04045
				? value / 12.92
				: ((value + 0.055) / 1.055) ** 2.4;
		})
		.reduce(
			(sum, value, index) => sum + value * [0.2126, 0.7152, 0.0722][index],
			0,
		);
}

function contrastRatio(foreground: Rgb, background: Rgb): number {
	const foregroundLuminance = relativeLuminance(foreground);
	const backgroundLuminance = relativeLuminance(background);
	return (
		(Math.max(foregroundLuminance, backgroundLuminance) + 0.05) /
		(Math.min(foregroundLuminance, backgroundLuminance) + 0.05)
	);
}

function blendRgb(background: Rgb, foreground: Rgb, opacity: number): Rgb {
	return [
		Math.round(background[0] + (foreground[0] - background[0]) * opacity),
		Math.round(background[1] + (foreground[1] - background[1]) * opacity),
		Math.round(background[2] + (foreground[2] - background[2]) * opacity),
	];
}

function stepToward(color: Rgb, target: 0 | 255): Rgb {
	const stepChannel = (channel: number): number =>
		target === 0
			? Math.max(0, channel - Math.max(1, Math.ceil(channel * 0.1)))
			: Math.min(255, channel + Math.max(1, Math.ceil((255 - channel) * 0.1)));
	return [stepChannel(color[0]), stepChannel(color[1]), stepChannel(color[2])];
}

/** Reference implementation of xterm's contrast adjustment for regression assertions. */
function ensureContrastFloor(
	background: Rgb,
	foreground: Rgb,
	ratio: number,
): Rgb {
	if (contrastRatio(foreground, background) >= ratio) return foreground;

	const candidates: Rgb[] = [];
	for (const target of [0, 255] as const) {
		let candidate = foreground;
		while (
			contrastRatio(candidate, background) < ratio &&
			candidate.some((channel) => channel !== target)
		) {
			candidate = stepToward(candidate, target);
		}
		candidates.push(candidate);
	}

	return candidates.reduce((best, candidate) =>
		contrastRatio(candidate, background) > contrastRatio(best, background)
			? candidate
			: best,
	);
}

const LIGHT_THEME: ITheme = { foreground: "#000000", background: "#ffffff" };
const DARK_THEME: ITheme = { foreground: "#ffffff", background: "#151110" };

describe("terminal minimum contrast", () => {
	test("covers sampled Codex diff colors, including SGR 2 dim cells", () => {
		// Sampled from the unreadable light-theme report: both pairs start near
		// 1.2:1. The renderer enforces this floor on the composited dim color.
		expect(contrastRatio([52, 72, 60], [33, 58, 43])).toBeLessThan(1.3);
		expect(contrastRatio([87, 50, 45], [73, 34, 29])).toBeLessThan(1.3);
		expect(TERMINAL_MINIMUM_CONTRAST_RATIO).toBe(4.5);

		const background: Rgb = [255, 255, 255];
		const opaqueForeground: Rgb = [0, 0, 0];
		const renderedDimForeground = blendRgb(background, opaqueForeground, 0.5);
		expect(contrastRatio(renderedDimForeground, background)).toBeLessThan(
			TERMINAL_MINIMUM_CONTRAST_RATIO,
		);

		const adjustedRenderedForeground = ensureContrastFloor(
			background,
			renderedDimForeground,
			TERMINAL_MINIMUM_CONTRAST_RATIO,
		);
		expect(
			contrastRatio(adjustedRenderedForeground, background),
		).toBeGreaterThanOrEqual(TERMINAL_MINIMUM_CONTRAST_RATIO);
	});

	test("configures v1 terminals with the shared contrast floor", () => {
		expect(TERMINAL_OPTIONS.minimumContrastRatio).toBe(
			TERMINAL_MINIMUM_CONTRAST_RATIO,
		);
	});

	test("configures v2 terminals with the shared contrast floor", () => {
		const options = buildTerminalOptions(120, 32, {
			theme: LIGHT_THEME,
			background: "#ffffff",
			fontFamily: "monospace",
			fontSize: 14,
		});

		expect(options.minimumContrastRatio).toBe(TERMINAL_MINIMUM_CONTRAST_RATIO);
		expect(options.theme).toBe(LIGHT_THEME);
	});

	test("restores the contrast floor across live light and dark theme changes", () => {
		const terminal = new XTerm({
			theme: LIGHT_THEME,
			minimumContrastRatio: 1,
		});

		try {
			applyTerminalTheme(terminal, DARK_THEME);
			expect(terminal.options.theme).toBe(DARK_THEME);
			expect(terminal.options.minimumContrastRatio).toBe(
				TERMINAL_MINIMUM_CONTRAST_RATIO,
			);

			applyTerminalTheme(terminal, LIGHT_THEME);
			expect(terminal.options.theme).toBe(LIGHT_THEME);
			expect(terminal.options.minimumContrastRatio).toBe(
				TERMINAL_MINIMUM_CONTRAST_RATIO,
			);
		} finally {
			terminal.dispose();
		}
	});
});
