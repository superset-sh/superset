import { beforeEach, describe, expect, it, mock } from "bun:test";

// Mock matchMedia before importing the store
const mockMatchMedia = mock(() => ({
	matches: true, // default: OS prefers dark
	addEventListener: mock(() => {}),
	removeEventListener: mock(() => {}),
}));

// @ts-expect-error - mocking global
globalThis.window = {
	matchMedia: mockMatchMedia,
};

// Mock localStorage
const mockStorage = new Map<string, string>();
// @ts-expect-error - mocking global
globalThis.localStorage = {
	getItem: (key: string) => mockStorage.get(key) ?? null,
	setItem: (key: string, value: string) => mockStorage.set(key, value),
	removeItem: (key: string) => mockStorage.delete(key),
	clear: () => mockStorage.clear(),
};

// Mock document for applyUIColors / updateThemeClass
// @ts-expect-error - mocking global
globalThis.document = {
	documentElement: {
		style: { setProperty: mock(() => {}) },
		classList: {
			add: mock(() => {}),
			remove: mock(() => {}),
		},
	},
};

// Mock the trpc-storage module to use a simple in-memory storage
mock.module("../../lib/trpc-storage", () => ({
	trpcThemeStorage: {
		getItem: () => null,
		setItem: () => {},
		removeItem: () => {},
	},
}));

const { useThemeStore, SYSTEM_THEME_ID } = await import("./store");

function setOsPrefersDark(prefersDark: boolean) {
	mockMatchMedia.mockReturnValue({
		matches: prefersDark,
		addEventListener: mock(() => {}),
		removeEventListener: mock(() => {}),
	});
}

describe("theme store - system theme mapping", () => {
	beforeEach(() => {
		mockStorage.clear();
		setOsPrefersDark(true);

		// Reset store to defaults
		useThemeStore.setState({
			activeThemeId: "dark",
			systemDarkThemeId: "dark",
			systemLightThemeId: "light",
			customThemes: [],
			activeTheme: null,
			terminalTheme: null,
		});
	});

	it("has correct default system theme mappings", () => {
		const state = useThemeStore.getState();
		expect(state.systemDarkThemeId).toBe("dark");
		expect(state.systemLightThemeId).toBe("light");
	});

	it("resolves system theme to dark mapping when OS prefers dark", () => {
		setOsPrefersDark(true);
		useThemeStore.getState().setTheme(SYSTEM_THEME_ID);

		const state = useThemeStore.getState();
		expect(state.activeThemeId).toBe(SYSTEM_THEME_ID);
		expect(state.activeTheme?.id).toBe("dark");
	});

	it("resolves system theme to light mapping when OS prefers light", () => {
		setOsPrefersDark(false);
		useThemeStore.getState().setTheme(SYSTEM_THEME_ID);

		const state = useThemeStore.getState();
		expect(state.activeThemeId).toBe(SYSTEM_THEME_ID);
		expect(state.activeTheme?.id).toBe("light");
	});

	it("resolves system theme to custom dark mapping", () => {
		// Add a custom dark theme (monokai is built-in and dark)
		setOsPrefersDark(true);

		// Set monokai as the dark mapping
		useThemeStore.getState().setSystemThemeMapping("dark", "monokai");
		expect(useThemeStore.getState().systemDarkThemeId).toBe("monokai");

		// Select system theme
		useThemeStore.getState().setTheme(SYSTEM_THEME_ID);

		const state = useThemeStore.getState();
		expect(state.activeThemeId).toBe(SYSTEM_THEME_ID);
		expect(state.activeTheme?.id).toBe("monokai");
	});

	it("setSystemThemeMapping re-applies theme when system is active", () => {
		setOsPrefersDark(true);

		// First select system theme (resolves to "dark")
		useThemeStore.getState().setTheme(SYSTEM_THEME_ID);
		expect(useThemeStore.getState().activeTheme?.id).toBe("dark");

		// Change dark mapping to monokai — should re-apply immediately
		useThemeStore.getState().setSystemThemeMapping("dark", "monokai");
		expect(useThemeStore.getState().activeTheme?.id).toBe("monokai");
	});

	it("setSystemThemeMapping does not re-apply when system is not active", () => {
		// Set a specific theme (not system)
		useThemeStore.getState().setTheme("dark");
		expect(useThemeStore.getState().activeTheme?.id).toBe("dark");

		// Change mapping — should NOT change active theme
		useThemeStore.getState().setSystemThemeMapping("dark", "monokai");
		expect(useThemeStore.getState().systemDarkThemeId).toBe("monokai");
		expect(useThemeStore.getState().activeTheme?.id).toBe("dark");
	});

	it("removeCustomTheme resets system mapping to built-in", () => {
		const customTheme = {
			id: "catppuccin",
			name: "Catppuccin",
			type: "dark" as const,
			ui: {} as never,
		};
		useThemeStore.getState().upsertCustomThemes([customTheme]);
		useThemeStore.getState().setSystemThemeMapping("dark", "catppuccin");

		expect(useThemeStore.getState().systemDarkThemeId).toBe("catppuccin");

		// Remove the custom theme
		useThemeStore.getState().removeCustomTheme("catppuccin");

		// Should reset to built-in "dark"
		expect(useThemeStore.getState().systemDarkThemeId).toBe("dark");
	});
});
