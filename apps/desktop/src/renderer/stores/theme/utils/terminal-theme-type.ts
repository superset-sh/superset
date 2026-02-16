type ThemeType = "dark" | "light";

function isThemeType(value: string | null): value is ThemeType {
	return value === "dark" || value === "light";
}

export function resolveTerminalThemeType(params?: {
	activeThemeType?: ThemeType;
}): ThemeType {
	const activeThemeType = params?.activeThemeType;
	if (activeThemeType) {
		return activeThemeType;
	}

	try {
		const persistedThemeType = localStorage.getItem("theme-type");
		if (isThemeType(persistedThemeType)) {
			return persistedThemeType;
		}
	} catch {
		// localStorage unavailable in some contexts
	}

	return "dark";
}
