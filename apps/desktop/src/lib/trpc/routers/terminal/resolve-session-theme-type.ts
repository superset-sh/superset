import { nativeTheme } from "electron";
import type { ThemeState } from "main/lib/app-state/schemas";
import { resolveTerminalThemeType } from "./theme-type";

type ThemeType = "dark" | "light";

/**
 * Resolve the terminal theme type for a session, consulting the OS appearance
 * via Electron's `nativeTheme` when the app theme follows the system ("system").
 *
 * This drives the terminal's COLORFGBG env var, which Claude Code's "auto" theme
 * reads to match the Superset app theme. Without the OS appearance, a "system"
 * app theme falls back to dark, so light-mode users saw Claude Code stuck in dark
 * mode (out of sync with the app). See #5314.
 */
export function resolveSessionTerminalThemeType(params: {
	requestedThemeType?: ThemeType;
	persistedThemeState?: ThemeState;
}): ThemeType {
	return resolveTerminalThemeType({
		...params,
		systemPrefersDark: nativeTheme.shouldUseDarkColors,
	});
}
