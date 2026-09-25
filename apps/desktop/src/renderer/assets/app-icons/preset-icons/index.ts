import { getPresetIcon, isDataImageUri } from "@superset/ui/icons/preset-icons";
import { useThemeStore } from "renderer/stores/theme/store";

export { getPresetIcon, isDataImageUri };

export function usePresetIcon(presetName: string): string | undefined {
	const activeTheme = useThemeStore((state) => state.activeTheme);
	const isDark = activeTheme?.type === "dark";
	return getPresetIcon(presetName, isDark);
}

export function useIsDarkTheme(): boolean {
	const activeTheme = useThemeStore((state) => state.activeTheme);
	return activeTheme?.type === "dark";
}
