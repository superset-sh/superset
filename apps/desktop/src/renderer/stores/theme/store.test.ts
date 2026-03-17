import { beforeEach, describe, expect, mock, test } from "bun:test";

// Mock trpc-storage before importing the store — the persist middleware
// tries to reach Electron IPC which isn't available in tests.
mock.module("../../lib/trpc-storage", () => {
	const noopStorage = {
		getItem: () => null,
		setItem: () => {},
		removeItem: () => {},
	};
	return {
		trpcThemeStorage: noopStorage,
		trpcTabsStorage: noopStorage,
		trpcHotkeysStorage: noopStorage,
		trpcRingtoneStorage: noopStorage,
		setSkipNextHotkeysPersist: () => {},
	};
});

// Provide a minimal matchMedia so getSystemPreferredThemeType() works.
if (typeof window !== "undefined" && !window.matchMedia) {
	// biome-ignore lint/suspicious/noExplicitAny: minimal mock for tests
	(window as any).matchMedia = () => ({
		matches: true, // simulate dark mode
		addEventListener: () => {},
		removeEventListener: () => {},
	});
}

const { SYSTEM_THEME_ID, useThemeStore } = await import("./store");

function getState() {
	return useThemeStore.getState();
}

describe("system theme mapping", () => {
	beforeEach(() => {
		useThemeStore.setState({
			activeThemeId: "dark",
			systemDarkThemeId: "dark",
			systemLightThemeId: "light",
			customThemes: [],
		});
	});

	test("initial system theme IDs default to dark and light", () => {
		expect(getState().systemDarkThemeId).toBe("dark");
		expect(getState().systemLightThemeId).toBe("light");
	});

	test("setSystemTheme updates the dark mapping", () => {
		getState().setSystemTheme("dark", "monokai");
		expect(getState().systemDarkThemeId).toBe("monokai");
		expect(getState().systemLightThemeId).toBe("light");
	});

	test("setSystemTheme updates the light mapping", () => {
		getState().setSystemTheme("light", "catppuccin-latte");
		expect(getState().systemDarkThemeId).toBe("dark");
		expect(getState().systemLightThemeId).toBe("catppuccin-latte");
	});

	test("removeCustomTheme resets system dark mapping if it references the removed theme", () => {
		getState().setSystemTheme("dark", "custom-dark");
		expect(getState().systemDarkThemeId).toBe("custom-dark");

		getState().removeCustomTheme("custom-dark");
		expect(getState().systemDarkThemeId).toBe("dark");
	});

	test("removeCustomTheme resets system light mapping if it references the removed theme", () => {
		getState().setSystemTheme("light", "custom-light");
		expect(getState().systemLightThemeId).toBe("custom-light");

		getState().removeCustomTheme("custom-light");
		expect(getState().systemLightThemeId).toBe("light");
	});

	test("removeCustomTheme does not reset unrelated system mappings", () => {
		getState().setSystemTheme("dark", "monokai");
		getState().setSystemTheme("light", "catppuccin-latte");

		getState().removeCustomTheme("some-other-theme");
		expect(getState().systemDarkThemeId).toBe("monokai");
		expect(getState().systemLightThemeId).toBe("catppuccin-latte");
	});

	test("setTheme to system stores SYSTEM_THEME_ID as activeThemeId", () => {
		getState().setTheme(SYSTEM_THEME_ID);
		expect(getState().activeThemeId).toBe(SYSTEM_THEME_ID);
	});
});
