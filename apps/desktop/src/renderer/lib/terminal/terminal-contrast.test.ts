import { describe, expect, test } from "bun:test";
import type { ITerminalOptions, ITheme } from "@xterm/xterm";
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

const LIGHT_THEME: ITheme = { foreground: "#000000", background: "#ffffff" };
const DARK_THEME: ITheme = { foreground: "#ffffff", background: "#151110" };

describe("terminal minimum contrast", () => {
	test("covers sampled Codex diff colors, including SGR 2 dim cells", () => {
		// Sampled from the unreadable light-theme report: both pairs start near
		// 1.2:1. The renderer enforces this floor on the composited dim color.
		expect(contrastRatio([52, 72, 60], [33, 58, 43])).toBeLessThan(1.3);
		expect(contrastRatio([87, 50, 45], [73, 34, 29])).toBeLessThan(1.3);
		expect(TERMINAL_MINIMUM_CONTRAST_RATIO).toBe(4.5);
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
		const options: ITerminalOptions = {
			theme: LIGHT_THEME,
			minimumContrastRatio: 1,
		};
		const terminal = { options };

		applyTerminalTheme(terminal, DARK_THEME);
		expect(options.theme).toBe(DARK_THEME);
		expect(options.minimumContrastRatio).toBe(TERMINAL_MINIMUM_CONTRAST_RATIO);

		applyTerminalTheme(terminal, LIGHT_THEME);
		expect(options.theme).toBe(LIGHT_THEME);
		expect(options.minimumContrastRatio).toBe(TERMINAL_MINIMUM_CONTRAST_RATIO);
	});
});
