// Agent icons
import claudeIcon from "./claude.svg";
import codexIcon from "./codex.svg";
import cursorAgentIcon from "./cursor-agent.svg";
import geminiIcon from "./gemini.svg";
import opencodeIcon from "./opencode.svg";

// IDE/App icons
import cursorIcon from "./cursor.svg";
import finderIcon from "./finder.png";
import itermIcon from "./iterm.png";
import jetbrainsIcon from "./jetbrains.svg";
import sublimeIcon from "./sublime.svg";
import terminalIcon from "./terminal.png";
import vscodeIcon from "./vscode.svg";
import warpIcon from "./warp.png";
import xcodeIcon from "./xcode.svg";

export {
	// Agents
	claudeIcon,
	codexIcon,
	cursorAgentIcon,
	geminiIcon,
	opencodeIcon,
	// IDEs/Apps
	cursorIcon,
	finderIcon,
	itermIcon,
	jetbrainsIcon,
	sublimeIcon,
	terminalIcon,
	vscodeIcon,
	warpIcon,
	xcodeIcon,
};

export interface PresetIconSet {
	light: string;
	dark: string;
}

// Preset icons for terminal agents (used by desktop app)
export const PRESET_ICONS: Record<string, PresetIconSet> = {
	claude: { light: claudeIcon, dark: claudeIcon },
	codex: { light: codexIcon, dark: codexIcon },
	gemini: { light: geminiIcon, dark: geminiIcon },
	"cursor-agent": { light: cursorAgentIcon, dark: cursorAgentIcon },
	opencode: { light: opencodeIcon, dark: opencodeIcon },
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
