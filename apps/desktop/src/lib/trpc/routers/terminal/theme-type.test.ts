import { describe, expect, it } from "bun:test";
import type { ThemeState } from "main/lib/app-state/schemas";
import { builtInThemes } from "shared/themes";
import { resolveTerminalThemeType } from "./theme-type";

function createThemeState(params: Partial<ThemeState>): ThemeState {
	return {
		activeThemeId: "dark",
		customThemes: [],
		...params,
	};
}

describe("resolveTerminalThemeType", () => {
	it("returns requested theme type when provided", () => {
		const result = resolveTerminalThemeType({
			requestedThemeType: "light",
		});
		expect(result).toBe("light");
	});

	it("resolves built-in theme type from persisted state", () => {
		const result = resolveTerminalThemeType({
			persistedThemeState: createThemeState({ activeThemeId: "light" }),
		});
		expect(result).toBe("light");
	});

	it("resolves custom theme type from persisted state", () => {
		const baseLightTheme = builtInThemes.find(
			(theme) => theme.type === "light",
		);
		if (!baseLightTheme) {
			throw new Error("Missing built-in light theme for test");
		}

		const customLightTheme = {
			...baseLightTheme,
			id: "custom-light",
			isBuiltIn: false,
			isCustom: true,
		};

		const result = resolveTerminalThemeType({
			persistedThemeState: createThemeState({
				activeThemeId: customLightTheme.id,
				customThemes: [customLightTheme],
			}),
		});
		expect(result).toBe("light");
	});

	it("resolves system theme using system preference", () => {
		const darkResult = resolveTerminalThemeType({
			persistedThemeState: createThemeState({ activeThemeId: "system" }),
			systemPrefersDark: true,
		});
		expect(darkResult).toBe("dark");

		const lightResult = resolveTerminalThemeType({
			persistedThemeState: createThemeState({ activeThemeId: "system" }),
			systemPrefersDark: false,
		});
		expect(lightResult).toBe("light");
	});

	it("falls back to dark for unknown themes", () => {
		const result = resolveTerminalThemeType({
			persistedThemeState: createThemeState({ activeThemeId: "unknown-theme" }),
		});
		expect(result).toBe("dark");
	});
});
