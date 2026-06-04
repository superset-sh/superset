import type { Theme } from "../types";
import { darkTheme } from "./ember";
import { lightTheme } from "./light";
import { monokaiTheme } from "./monokai";
/**
 * All built-in themes
 */
export const builtInThemes: Theme[] = [darkTheme, lightTheme, monokaiTheme];

/**
 * Default theme ID
 */
export const DEFAULT_THEME_ID = "dark";

/**
 * Get a built-in theme by ID
 */
export function getBuiltInTheme(id: string): Theme | undefined {
	return builtInThemes.find((theme) => theme.id === id);
}

// Re-export individual themes
export { darkTheme, lightTheme, monokaiTheme };
