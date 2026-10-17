import { describe, expect, it } from "bun:test";
import {
	applyTerminalThemeCssVariables,
	resolveTerminalAppearance,
	TERMINAL_BACKGROUND_CSS_VARIABLE,
	TERMINAL_FOREGROUND_CSS_VARIABLE,
} from "./appearance";
import {
	type TerminalRuntime,
	updateRuntimeAppearance,
} from "./terminal-runtime";

/**
 * The test setup stubs `document.createElement` without a working style, so
 * use a minimal element whose style supports custom properties.
 */
function styledElement(): HTMLDivElement {
	const properties = new Map<string, string>();
	return {
		style: {
			// Mirrors the CSSOM: an empty value removes the property.
			setProperty: (name: string, value: string) =>
				value === "" ? properties.delete(name) : properties.set(name, value),
			getPropertyValue: (name: string) => properties.get(name) ?? "",
		},
	} as unknown as HTMLDivElement;
}

const lightTheme = { background: "#fdf6e3", foreground: "#657b83" };
const darkTheme = { background: "#002b36", foreground: "#839496" };

/**
 * The smallest runtime updateRuntimeAppearance touches. Its terminal options
 * already match the appearance's font settings, so an update with a new theme
 * is a theme-only change and takes the no-remeasure path.
 */
function fakeRuntime(appearance: ReturnType<typeof resolveTerminalAppearance>) {
	let refreshed = 0;
	const runtime = {
		wrapper: styledElement(),
		ligaturesEnabled: appearance.ligatures,
		_setLigaturesEnabled: null,
		container: null,
		terminal: {
			rows: 24,
			options: {
				theme: appearance.theme,
				fontFamily: appearance.fontFamily,
				fontSize: appearance.fontSize,
				lineHeight: appearance.lineHeight,
				letterSpacing: appearance.letterSpacing,
				fontWeight: appearance.fontWeight,
			},
			refresh: () => {
				refreshed++;
			},
		},
	};
	return {
		runtime: runtime as unknown as TerminalRuntime,
		refreshCount: () => refreshed,
	};
}

describe("applyTerminalThemeCssVariables", () => {
	it("sets the background and foreground variables", () => {
		const element = styledElement();
		applyTerminalThemeCssVariables(element, lightTheme);
		expect(
			element.style.getPropertyValue(TERMINAL_BACKGROUND_CSS_VARIABLE),
		).toBe(lightTheme.background);
		expect(
			element.style.getPropertyValue(TERMINAL_FOREGROUND_CSS_VARIABLE),
		).toBe(lightTheme.foreground);
	});

	it("removes a variable when the theme has no value for it", () => {
		const element = styledElement();
		applyTerminalThemeCssVariables(element, lightTheme);
		applyTerminalThemeCssVariables(element, { background: "#000000" });
		expect(
			element.style.getPropertyValue(TERMINAL_FOREGROUND_CSS_VARIABLE),
		).toBe("");
	});
});

describe("updateRuntimeAppearance theme variables", () => {
	it("updates the variables on a theme-only change", () => {
		const initial = resolveTerminalAppearance(darkTheme);
		const { runtime, refreshCount } = fakeRuntime(initial);
		applyTerminalThemeCssVariables(runtime.wrapper, darkTheme);

		updateRuntimeAppearance(runtime, resolveTerminalAppearance(lightTheme));

		// No font change, so this took the refresh path, not a re-measure.
		expect(refreshCount()).toBe(1);
		expect(
			runtime.wrapper.style.getPropertyValue(TERMINAL_BACKGROUND_CSS_VARIABLE),
		).toBe(lightTheme.background);
		expect(
			runtime.wrapper.style.getPropertyValue(TERMINAL_FOREGROUND_CSS_VARIABLE),
		).toBe(lightTheme.foreground);
	});

	it("uses the resolved background when the theme has none", () => {
		const initial = resolveTerminalAppearance(darkTheme);
		const { runtime } = fakeRuntime(initial);
		const noBackground = resolveTerminalAppearance({ foreground: "#111111" });

		updateRuntimeAppearance(runtime, noBackground);

		expect(
			runtime.wrapper.style.getPropertyValue(TERMINAL_BACKGROUND_CSS_VARIABLE),
		).toBe(noBackground.background);
	});
});
