import type { ThemeState } from "main/lib/app-state/schemas";
import { builtInThemes, DEFAULT_THEME_ID } from "shared/themes";

type ThemeType = "dark" | "light";

export function resolveTerminalThemeType(params: {
	requestedThemeType?: ThemeType;
	persistedThemeState?: ThemeState;
	systemPrefersDark?: boolean;
}): ThemeType {
	const {
		requestedThemeType,
		persistedThemeState,
		systemPrefersDark = true,
	} = params;

	if (requestedThemeType) {
		return requestedThemeType;
	}

	if (!persistedThemeState) {
		return "dark";
	}

	const { activeThemeId, customThemes } = persistedThemeState;

	if (activeThemeId === "system") {
		return systemPrefersDark ? "dark" : "light";
	}

	const matchingTheme =
		customThemes.find((theme) => theme.id === activeThemeId) ||
		builtInThemes.find((theme) => theme.id === activeThemeId) ||
		builtInThemes.find((theme) => theme.id === DEFAULT_THEME_ID);

	return matchingTheme?.type ?? "dark";
}
