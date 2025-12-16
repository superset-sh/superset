import { useThemeStore } from "renderer/stores/theme/store";
import claudeIcon from "./claude.svg";
import codexIcon from "./codex.svg";
import codexWhiteIcon from "./codex-white.svg";
import cursorIcon from "./cursor.svg";
import geminiIcon from "./gemini.svg";

interface PresetIconSet {
	light: string;
	dark: string;
}

const PRESET_ICONS: Record<string, PresetIconSet> = {
	claude: { light: claudeIcon, dark: claudeIcon },
	codex: { light: codexIcon, dark: codexWhiteIcon },
	gemini: { light: geminiIcon, dark: geminiIcon },
	"cursor-agent": { light: cursorIcon, dark: cursorIcon },
};

export function getPresetIcon(
	presetName: string,
	isDark: boolean,
): string | undefined {
	const normalizedName = presetName.toLowerCase().trim();
	const iconSet = PRESET_ICONS[normalizedName];
	if (!iconSet) return undefined;
	return isDark ? iconSet.dark : iconSet.light;
}

export function usePresetIcon(presetName: string): string | undefined {
	const activeTheme = useThemeStore((state) => state.activeTheme);
	const isDark = activeTheme?.type === "dark";
	return getPresetIcon(presetName, isDark);
}

export function useIsDarkTheme(): boolean {
	const activeTheme = useThemeStore((state) => state.activeTheme);
	return activeTheme?.type === "dark";
}
