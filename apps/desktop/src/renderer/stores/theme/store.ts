import type { ITheme } from "@xterm/xterm";
import {
	builtInThemes,
	DEFAULT_THEME_ID,
	type Theme,
	type ThemeMetadata,
} from "shared/themes";
import { create } from "zustand";
import { devtools, persist } from "zustand/middleware";
import { trpcThemeStorage } from "../../lib/trpc-storage";
import {
	applyUIColors,
	type MonacoTheme,
	toMonacoTheme,
	toXtermTheme,
	updateThemeClass,
} from "./utils";

interface ThemeState {
	/** Current active theme ID */
	activeThemeId: string;

	/** List of custom (user-imported) themes */
	customThemes: Theme[];

	/** The currently active theme object */
	activeTheme: Theme | null;

	/** Terminal theme in xterm.js format (derived from activeTheme) */
	terminalTheme: ITheme | null;

	/** Monaco editor theme (derived from activeTheme) */
	monacoTheme: MonacoTheme | null;

	/** Set the active theme by ID */
	setTheme: (themeId: string) => void;

	/** Add a custom theme */
	addCustomTheme: (theme: Theme) => void;

	/** Remove a custom theme by ID */
	removeCustomTheme: (themeId: string) => void;

	/** Get list of all available themes (built-in + custom) */
	getAllThemes: () => ThemeMetadata[];

	/** Initialize theme on app start (called after hydration) */
	initializeTheme: () => void;
}

/**
 * Find a theme by ID from built-in and custom themes
 */
function findTheme(themeId: string, customThemes: Theme[]): Theme | undefined {
	return (
		builtInThemes.find((t) => t.id === themeId) ||
		customThemes.find((t) => t.id === themeId)
	);
}

/**
 * Sync theme data to localStorage for instant access before hydration.
 * This enables flash-free terminal rendering on app start.
 * Caches terminal colors directly to support custom themes without lookup.
 */
function syncThemeToLocalStorage(theme: Theme): void {
	try {
		localStorage.setItem("theme-type", theme.type);
		localStorage.setItem("theme-id", theme.id);
		localStorage.setItem("theme-terminal", JSON.stringify(theme.terminal));
	} catch {
		// localStorage may not be available
	}
}

/**
 * Apply a theme to the UI and terminal
 */
function applyTheme(theme: Theme): {
	terminalTheme: ITheme;
	monacoTheme: MonacoTheme;
} {
	// Apply UI colors to CSS variables
	applyUIColors(theme.ui);

	// Update dark/light class
	updateThemeClass(theme.type);

	syncThemeToLocalStorage(theme);

	// Convert to editor-specific formats
	return {
		terminalTheme: toXtermTheme(theme.terminal),
		monacoTheme: toMonacoTheme(theme),
	};
}

export const useThemeStore = create<ThemeState>()(
	devtools(
		persist(
			(set, get) => ({
				activeThemeId: DEFAULT_THEME_ID,
				customThemes: [],
				activeTheme: null,
				terminalTheme: null,
				monacoTheme: null,

				setTheme: (themeId: string) => {
					const state = get();
					const theme = findTheme(themeId, state.customThemes);

					if (!theme) {
						console.error(`Theme not found: ${themeId}`);
						return;
					}

					const { terminalTheme, monacoTheme } = applyTheme(theme);

					set({
						activeThemeId: themeId,
						activeTheme: theme,
						terminalTheme,
						monacoTheme,
					});
				},

				addCustomTheme: (theme: Theme) => {
					const customTheme = { ...theme, isCustom: true, isBuiltIn: false };
					set((state) => ({
						customThemes: [...state.customThemes, customTheme],
					}));
				},

				removeCustomTheme: (themeId: string) => {
					const state = get();

					// If removing the active theme, switch to default
					if (state.activeThemeId === themeId) {
						state.setTheme(DEFAULT_THEME_ID);
					}

					set((state) => ({
						customThemes: state.customThemes.filter((t) => t.id !== themeId),
					}));
				},

				getAllThemes: () => {
					const state = get();
					const allThemes = [...builtInThemes, ...state.customThemes];
					return allThemes.map((t) => ({
						id: t.id,
						name: t.name,
						author: t.author,
						type: t.type,
						isBuiltIn: t.isBuiltIn ?? false,
						isCustom: t.isCustom ?? false,
					}));
				},

				initializeTheme: () => {
					const state = get();
					const theme = findTheme(state.activeThemeId, state.customThemes);

					if (theme) {
						const { terminalTheme, monacoTheme } = applyTheme(theme);
						set({
							activeTheme: theme,
							terminalTheme,
							monacoTheme,
						});
					} else {
						state.setTheme(DEFAULT_THEME_ID);
					}
				},
			}),
			{
				name: "theme-storage",
				storage: trpcThemeStorage,
				partialize: (state) => ({
					activeThemeId: state.activeThemeId,
					customThemes: state.customThemes,
				}),
				onRehydrateStorage: () => (state) => {
					if (state) {
						state.initializeTheme();
					}
				},
			},
		),
		{ name: "ThemeStore" },
	),
);

// Convenience hooks
export const useTheme = () => useThemeStore((state) => state.activeTheme);
export const useTerminalTheme = () =>
	useThemeStore((state) => state.terminalTheme);
export const useMonacoTheme = () => useThemeStore((state) => state.monacoTheme);
export const useSetTheme = () => useThemeStore((state) => state.setTheme);
export const useThemeId = () => useThemeStore((state) => state.activeThemeId);
