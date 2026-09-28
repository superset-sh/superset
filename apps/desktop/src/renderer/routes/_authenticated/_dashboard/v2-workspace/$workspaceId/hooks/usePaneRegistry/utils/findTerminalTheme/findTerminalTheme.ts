import { builtInThemes, type Theme } from "shared/themes";

export function findTerminalTheme(
	themeId: string | null | undefined,
	customThemes: readonly Theme[],
): Theme | null {
	if (!themeId) return null;
	return (
		builtInThemes.find((theme) => theme.id === themeId) ??
		customThemes.find((theme) => theme.id === themeId) ??
		null
	);
}
