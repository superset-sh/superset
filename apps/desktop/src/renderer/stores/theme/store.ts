import type { ITheme } from "@xterm/xterm";
import {
	builtInThemes,
	DEFAULT_THEME_ID,
	darkTheme,
	getTerminalColors,
	type Theme,
	type ThemeMetadata,
} from "shared/themes";
import { create } from "zustand";
import { devtools, persist } from "zustand/middleware";
import { trpcThemeStorage } from "../../lib/trpc-storage";
import { applyUIColors, toXtermTheme, updateThemeClass } from "./utils";

/** Special theme ID for system preference (follows OS dark/light mode) */
export const SYSTEM_THEME_ID = "system";

interface ThemeState {
	/** Current active theme ID (can be "system" or a specific theme ID) */
	activeThemeId: string;

	/** Theme ID to use when OS is in light mode and system theme is active */
	systemLightThemeId: string;

	/** Theme ID to use when OS is in dark mode and system theme is active */
	systemDarkThemeId: string;

	/** List of custom (user-imported) themes */
	customThemes: Theme[];

	/** The currently active theme object (resolved from system preference if needed) */
	activeTheme: Theme | null;

	/** Terminal theme in xterm.js format (derived from activeTheme) */
	terminalTheme: ITheme | null;

	/** Set the active theme by ID (can be "system" or a specific theme ID) */
	setTheme: (themeId: string) => void;

	/** Set the theme to use for a specific OS mode when system theme is active */
	setSystemThemeMapping: (osMode: "dark" | "light", themeId: string) => void;

	/** Add a custom theme */
	addCustomTheme: (theme: Theme) => void;
	/** Add or replace custom themes by ID */
	upsertCustomThemes: (themes: Theme[]) => {
		added: number;
		updated: number;
		skipped: number;
	};

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
 * If "system" is passed, resolves using the user's custom mapping for the current OS mode.
 */
function resolveThemeId(
	themeId: string,
	systemDarkThemeId: string,
	systemLightThemeId: string,
): string {
	if (themeId === SYSTEM_THEME_ID) {
		const osMode = getSystemPreferredThemeType();
		return osMode === "dark" ? systemDarkThemeId : systemLightThemeId;
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

const builtInThemeIds = new Set(builtInThemes.map((theme) => theme.id));

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
} {
	// Apply UI colors to CSS variables
	applyUIColors(theme.ui);

	// Update dark/light class
	updateThemeClass(theme.type);

	syncThemeToLocalStorage(theme);

	// Convert to editor-specific formats
	return {
		terminalTheme: toXtermTheme(getTerminalColors(theme)),
	};
}

export const useThemeStore = create<ThemeState>()(
	devtools(
		persist(
			(set, get) => ({
				activeThemeId: DEFAULT_THEME_ID,
				systemLightThemeId: "light",
				systemDarkThemeId: "dark",
				customThemes: [],
				activeTheme: null,
				terminalTheme: null,

				setTheme: (themeId: string) => {
					const state = get();
					const resolvedId = resolveThemeId(
						themeId,
						state.systemDarkThemeId,
						state.systemLightThemeId,
					);
					const theme = findTheme(resolvedId, state.customThemes);

					if (!theme) {
						console.error(`Theme not found: ${resolvedId}`);
						return;
					}

					const { terminalTheme } = applyTheme(theme);

					set({
						activeThemeId: themeId, // Store the original ID (could be "system")
						activeTheme: theme, // Store the resolved theme
						terminalTheme,
					});
				},

				setSystemThemeMapping: (osMode: "dark" | "light", themeId: string) => {
					const state = get();
					const update =
						osMode === "dark"
							? { systemDarkThemeId: themeId }
							: { systemLightThemeId: themeId };

					set(update);

					// Re-apply if system theme is currently active
					if (state.activeThemeId === SYSTEM_THEME_ID) {
						const newState = get();
						const resolvedId = resolveThemeId(
							SYSTEM_THEME_ID,
							newState.systemDarkThemeId,
							newState.systemLightThemeId,
						);
						const theme = findTheme(resolvedId, newState.customThemes);
						if (theme) {
							const { terminalTheme } = applyTheme(theme);
							set({ activeTheme: theme, terminalTheme });
						}
					}
				},

				addCustomTheme: (theme: Theme) => {
					get().upsertCustomThemes([theme]);
				},

				upsertCustomThemes: (themes: Theme[]) => {
					const state = get();
					const customThemesById = new Map(
						state.customThemes.map((theme) => [theme.id, theme]),
					);

					let added = 0;
					let updated = 0;
					let skipped = 0;

					for (const theme of themes) {
						if (theme.id === SYSTEM_THEME_ID || builtInThemeIds.has(theme.id)) {
							skipped++;
							continue;
						}

						const customTheme = { ...theme, isCustom: true, isBuiltIn: false };
						if (customThemesById.has(customTheme.id)) {
							updated++;
						} else {
							added++;
						}
						customThemesById.set(customTheme.id, customTheme);
					}

					if (added + updated === 0) {
						return { added, updated, skipped };
					}

					const customThemes = Array.from(customThemesById.values());
					const resolvedId = resolveThemeId(
						state.activeThemeId,
						state.systemDarkThemeId,
						state.systemLightThemeId,
					);
					const resolvedTheme = findTheme(resolvedId, customThemes);

					if (!resolvedTheme) {
						set({ customThemes });
						return { added, updated, skipped };
					}

					const { terminalTheme } = applyTheme(resolvedTheme);
					set({
						customThemes,
						activeTheme: resolvedTheme,
						terminalTheme,
					});

					return { added, updated, skipped };
				},

				removeCustomTheme: (themeId: string) => {
					const state = get();

					// If removing the active theme, switch to default
					if (state.activeThemeId === themeId) {
						state.setTheme(DEFAULT_THEME_ID);
					}

					// If removing a theme used in system mapping, reset to built-in
					if (state.systemDarkThemeId === themeId) {
						set({ systemDarkThemeId: "dark" });
					}
					if (state.systemLightThemeId === themeId) {
						set({ systemLightThemeId: "light" });
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
					const resolvedId = resolveThemeId(
						state.activeThemeId,
						state.systemDarkThemeId,
						state.systemLightThemeId,
					);
					const theme = findTheme(resolvedId, state.customThemes);

					if (theme) {
						const { terminalTheme } = applyTheme(theme);
						set({
							activeTheme: theme,
							terminalTheme,
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
					systemLightThemeId: state.systemLightThemeId,
					systemDarkThemeId: state.systemDarkThemeId,
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
export const useResolvedTheme = () =>
	useThemeStore((state) => state.activeTheme ?? darkTheme);
export const useTerminalTheme = () =>
	useThemeStore((state) => state.terminalTheme);
export const useSetTheme = () => useThemeStore((state) => state.setTheme);
export const useThemeId = () => useThemeStore((state) => state.activeThemeId);
