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

/** Built-in fallback theme IDs for system mode */
const DEFAULT_LIGHT_THEME_ID = "light";
const DEFAULT_DARK_THEME_ID = "dark";

interface ThemeState {
	/** Current active theme ID (can be "system" or a specific theme ID) */
	activeThemeId: string;

	/** List of custom (user-imported) themes */
	customThemes: Theme[];

	/** Theme ID to use for light mode when "system" is active */
	systemLightThemeId: string;

	/** Theme ID to use for dark mode when "system" is active */
	systemDarkThemeId: string;

	/** The currently active theme object (resolved from system preference if needed) */
	activeTheme: Theme | null;

	/** Terminal theme in xterm.js format (derived from activeTheme) */
	terminalTheme: ITheme | null;

	/** Set the active theme by ID (can be "system" or a specific theme ID) */
	setTheme: (themeId: string) => void;

	/** Set which theme to use for a given system mode (light or dark) */
	setSystemThemePreference: (mode: "light" | "dark", themeId: string) => void;

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
 * If "system" is passed, resolves based on OS preference and user-configured system theme preferences.
 * Validates that the resolved system theme ID exists; falls back to built-in light/dark if stale.
 */
function resolveThemeId(
	themeId: string,
	systemLightThemeId: string,
	systemDarkThemeId: string,
	customThemes: Theme[] = [],
): string {
	if (themeId === SYSTEM_THEME_ID) {
		const prefersDark = getSystemPreferredThemeType() === "dark";
		const preferredId = prefersDark ? systemDarkThemeId : systemLightThemeId;
		const fallbackId = prefersDark
			? DEFAULT_DARK_THEME_ID
			: DEFAULT_LIGHT_THEME_ID;

		// Validate that the preferred ID still references an existing theme
		if (findTheme(preferredId, customThemes)) {
			return preferredId;
		}
		return fallbackId;
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
				customThemes: [],
				systemLightThemeId: DEFAULT_LIGHT_THEME_ID,
				systemDarkThemeId: DEFAULT_DARK_THEME_ID,
				activeTheme: null,
				terminalTheme: null,

				setTheme: (themeId: string) => {
					const state = get();
					const resolvedId = resolveThemeId(
						themeId,
						state.systemLightThemeId,
						state.systemDarkThemeId,
						state.customThemes,
					);
					const theme = findTheme(resolvedId, state.customThemes);

					if (!theme) {
						console.error(`Theme not found: ${resolvedId}`);
						return;
					}

					const { terminalTheme } = applyTheme(theme);

					set({
						activeThemeId: themeId,
						activeTheme: theme,
						terminalTheme,
					});
				},

				setSystemThemePreference: (mode: "light" | "dark", themeId: string) => {
					const state = get();
					if (
						themeId === SYSTEM_THEME_ID ||
						!findTheme(themeId, state.customThemes)
					) {
						return;
					}
					const prefUpdate =
						mode === "light"
							? { systemLightThemeId: themeId }
							: { systemDarkThemeId: themeId };

					// Re-resolve if system theme is currently active, batching into a single set()
					if (state.activeThemeId === SYSTEM_THEME_ID) {
						const newLightId =
							mode === "light" ? themeId : state.systemLightThemeId;
						const newDarkId =
							mode === "dark" ? themeId : state.systemDarkThemeId;
						const resolvedId = resolveThemeId(
							SYSTEM_THEME_ID,
							newLightId,
							newDarkId,
							state.customThemes,
						);
						const theme = findTheme(resolvedId, state.customThemes);
						if (theme) {
							const { terminalTheme } = applyTheme(theme);
							set({ ...prefUpdate, activeTheme: theme, terminalTheme });
							return;
						}
					}

					set(prefUpdate);
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
						state.systemLightThemeId,
						state.systemDarkThemeId,
						customThemes,
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

					// Reset system preferences if they reference the deleted theme
					const newLightId =
						state.systemLightThemeId === themeId
							? DEFAULT_LIGHT_THEME_ID
							: state.systemLightThemeId;
					const newDarkId =
						state.systemDarkThemeId === themeId
							? DEFAULT_DARK_THEME_ID
							: state.systemDarkThemeId;

					const customThemes = state.customThemes.filter(
						(t) => t.id !== themeId,
					);

					const baseUpdate = {
						customThemes,
						systemLightThemeId: newLightId,
						systemDarkThemeId: newDarkId,
					};

					// Re-resolve active theme if system mode is active, batching into a single set()
					if (state.activeThemeId === SYSTEM_THEME_ID) {
						const resolvedId = resolveThemeId(
							SYSTEM_THEME_ID,
							newLightId,
							newDarkId,
							customThemes,
						);
						const theme = findTheme(resolvedId, customThemes);
						if (theme) {
							const { terminalTheme } = applyTheme(theme);
							set({ ...baseUpdate, activeTheme: theme, terminalTheme });
							return;
						}
					}

					set(baseUpdate);
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

					// Normalize stale system theme IDs before resolving
					const lightExists = findTheme(
						state.systemLightThemeId,
						state.customThemes,
					);
					const darkExists = findTheme(
						state.systemDarkThemeId,
						state.customThemes,
					);
					const normalizedLightId = lightExists
						? state.systemLightThemeId
						: DEFAULT_LIGHT_THEME_ID;
					const normalizedDarkId = darkExists
						? state.systemDarkThemeId
						: DEFAULT_DARK_THEME_ID;

					if (!lightExists || !darkExists) {
						set({
							systemLightThemeId: normalizedLightId,
							systemDarkThemeId: normalizedDarkId,
						});
					}

					const resolvedId = resolveThemeId(
						state.activeThemeId,
						normalizedLightId,
						normalizedDarkId,
						state.customThemes,
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
					customThemes: state.customThemes,
					systemLightThemeId: state.systemLightThemeId,
					systemDarkThemeId: state.systemDarkThemeId,
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
export const useSystemLightThemeId = () =>
	useThemeStore((state) => state.systemLightThemeId);
export const useSystemDarkThemeId = () =>
	useThemeStore((state) => state.systemDarkThemeId);
export const useSetSystemThemePreference = () =>
	useThemeStore((state) => state.setSystemThemePreference);
