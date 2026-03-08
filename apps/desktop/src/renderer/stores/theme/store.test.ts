import { beforeEach, describe, expect, it } from "bun:test";
import type { Theme } from "shared/themes";
import { builtInThemes, DEFAULT_THEME_ID } from "shared/themes";
import { createStore } from "zustand/vanilla";

/**
 * Regression test for #1994 — support deletion of imported themes.
 *
 * The store has had `removeCustomTheme` since the beginning, but the UI
 * never exposed it: ThemeCard lacked an `onDelete` prop and ThemeSection
 * never called `removeCustomTheme`. These tests document the expected
 * store-level behavior and guard against regressions after the UI fix.
 */

const builtInThemeIds = new Set(builtInThemes.map((t) => t.id));

/** Minimal vanilla Zustand store that mirrors the theme store's custom-theme logic. */
function makeStore() {
	return createStore<{
		activeThemeId: string;
		customThemes: Theme[];
		addCustomTheme: (theme: Theme) => void;
		removeCustomTheme: (themeId: string) => void;
	}>()((set, get) => ({
		activeThemeId: DEFAULT_THEME_ID,
		customThemes: [],

		addCustomTheme: (theme: Theme) => {
			if (builtInThemeIds.has(theme.id)) return;
			const customTheme = {
				...theme,
				isCustom: true as const,
				isBuiltIn: false as const,
			};
			set((state) => ({
				customThemes: [...state.customThemes, customTheme],
			}));
		},

		removeCustomTheme: (themeId: string) => {
			const state = get();
			const activeThemeId =
				state.activeThemeId === themeId
					? DEFAULT_THEME_ID
					: state.activeThemeId;
			set((s) => ({
				activeThemeId,
				customThemes: s.customThemes.filter((t) => t.id !== themeId),
			}));
		},
	}));
}

const MOCK_CUSTOM_THEME: Theme = {
	id: "my-custom-theme",
	name: "My Custom Theme",
	type: "dark",
	isCustom: true,
	isBuiltIn: false,
	ui: builtInThemes[0]?.ui,
};

const MOCK_CUSTOM_THEME_2: Theme = {
	id: "another-custom-theme",
	name: "Another Custom Theme",
	type: "light",
	isCustom: true,
	isBuiltIn: false,
	ui: builtInThemes[0]?.ui,
};

describe("removeCustomTheme", () => {
	let store: ReturnType<typeof makeStore>;

	beforeEach(() => {
		store = makeStore();
	});

	it("removes an imported theme by ID", () => {
		store.getState().addCustomTheme(MOCK_CUSTOM_THEME);
		expect(store.getState().customThemes).toHaveLength(1);

		store.getState().removeCustomTheme(MOCK_CUSTOM_THEME.id);

		expect(store.getState().customThemes).toHaveLength(0);
	});

	it("leaves other custom themes intact when removing one", () => {
		store.getState().addCustomTheme(MOCK_CUSTOM_THEME);
		store.getState().addCustomTheme(MOCK_CUSTOM_THEME_2);
		expect(store.getState().customThemes).toHaveLength(2);

		store.getState().removeCustomTheme(MOCK_CUSTOM_THEME.id);

		const remaining = store.getState().customThemes;
		expect(remaining).toHaveLength(1);
		expect(remaining[0]?.id).toBe(MOCK_CUSTOM_THEME_2.id);
	});

	it("falls back to the default theme when the active custom theme is deleted", () => {
		store.getState().addCustomTheme(MOCK_CUSTOM_THEME);
		// Manually set the active theme to the custom theme
		store.setState({ activeThemeId: MOCK_CUSTOM_THEME.id });
		expect(store.getState().activeThemeId).toBe(MOCK_CUSTOM_THEME.id);

		store.getState().removeCustomTheme(MOCK_CUSTOM_THEME.id);

		expect(store.getState().activeThemeId).toBe(DEFAULT_THEME_ID);
		expect(store.getState().customThemes).toHaveLength(0);
	});

	it("keeps the active theme unchanged when a different custom theme is deleted", () => {
		store.getState().addCustomTheme(MOCK_CUSTOM_THEME);
		store.getState().addCustomTheme(MOCK_CUSTOM_THEME_2);
		store.setState({ activeThemeId: MOCK_CUSTOM_THEME_2.id });

		store.getState().removeCustomTheme(MOCK_CUSTOM_THEME.id);

		expect(store.getState().activeThemeId).toBe(MOCK_CUSTOM_THEME_2.id);
	});

	it("is a no-op when the theme ID does not exist", () => {
		store.getState().addCustomTheme(MOCK_CUSTOM_THEME);

		store.getState().removeCustomTheme("non-existent-id");

		expect(store.getState().customThemes).toHaveLength(1);
	});

	it("does not remove built-in themes", () => {
		// Built-in themes should never appear in customThemes, so attempting to
		// remove by a built-in ID should leave the list unchanged.
		store.getState().addCustomTheme(MOCK_CUSTOM_THEME);
		// addCustomTheme guards against built-in IDs, so customThemes stays at 1.
		// removeCustomTheme on a built-in ID is a no-op because it won't match.
		store.getState().removeCustomTheme("dark");

		expect(store.getState().customThemes).toHaveLength(1);
	});
});
