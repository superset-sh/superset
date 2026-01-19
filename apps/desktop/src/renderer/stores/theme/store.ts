import type { ITheme } from "@xterm/xterm";
import {
	builtInThemes,
	DEFAULT_THEME_ID,
	getTerminalColors,
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

/** Special theme ID for system preference (follows OS dark/light mode) */
export const SYSTEM_THEME_ID = "system";

interface ThemeState {
	/** Current active theme ID (can be "system" or a specific theme ID) */
	activeThemeId: string;

	/** List of custom (user-imported) themes */
	customThemes: Theme[];

	/** The currently active theme object (resolved from system preference if needed) */
	activeTheme: Theme | null;

	/** Terminal theme in xterm.js format (derived from activeTheme) */
	terminalTheme: ITheme | null;

	/** Monaco editor theme (derived from activeTheme) */
	monacoTheme: MonacoTheme | null;

	/** Set the active theme by ID (can be "system" or a specific theme ID) */
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
 * Get the system preferred theme type (dark or light)
 */
function getSystemPreferredThemeType(): "dark" | "light" {
	if (typeof window === "undefined") return "dark";
	return window.matchMedia("(prefers-color-scheme: dark)").matches
		? "dark"
		: "light";
}

/**
 * Resolve a theme ID to the actual theme ID to use.
 * If "system" is passed, resolves to "dark" or "light" based on OS preference.
 */
function resolveThemeId(themeId: string): string {
	if (themeId === SYSTEM_THEME_ID) {
		return getSystemPreferredThemeType();
	}
	return themeId;
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
		localStorage.setItem(
			"theme-terminal",
			JSON.stringify(getTerminalColors(theme)),
		);
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
		terminalTheme: toXtermTheme(getTerminalColors(theme)),
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
					// Resolve system theme to actual theme ID
					const resolvedId = resolveThemeId(themeId);
					const theme = findTheme(resolvedId, state.customThemes);

					if (!theme) {
						console.error(`Theme not found: ${resolvedId}`);
						return;
					}

					const { terminalTheme, monacoTheme } = applyTheme(theme);

					set({
						activeThemeId: themeId, // Store the original ID (could be "system")
						activeTheme: theme, // Store the resolved theme
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
					const resolvedId = resolveThemeId(state.activeThemeId);
					const theme = findTheme(resolvedId, state.customThemes);

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

					// Set up listener for OS theme preference changes
					if (typeof window !== "undefined") {
						const mediaQuery = window.matchMedia(
							"(prefers-color-scheme: dark)",
						);
						const handleChange = () => {
							const currentState = get();
							// Only update if system theme is selected
							if (currentState.activeThemeId === SYSTEM_THEME_ID) {
								currentState.setTheme(SYSTEM_THEME_ID);
							}
						};
						mediaQuery.addEventListener("change", handleChange);
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
