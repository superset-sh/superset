import ampIcon from "./amp.svg";
import claudeIcon from "./claude.svg";
import codexIcon from "./codex.svg";
import codexWhiteIcon from "./codex-white.svg";
import copilotIcon from "./copilot.svg";
import copilotWhiteIcon from "./copilot-white.svg";
import cursorAgentIcon from "./cursor.svg";
import droidIcon from "./droid.svg";
import droidWhiteIcon from "./droid-white.svg";
import geminiIcon from "./gemini.svg";
import kimiIcon from "./kimi.svg";
import kimiWhiteIcon from "./kimi-white.svg";
import mastracodeIcon from "./mastracode.svg";
import mastracodeWhiteIcon from "./mastracode-white.svg";
import opencodeIcon from "./opencode.svg";
import opencodeWhiteIcon from "./opencode-white.svg";
import piIcon from "./pi.svg";
import piWhiteIcon from "./pi-white.svg";
import polygraphIcon from "./polygraph.svg";
import polygraphWhiteIcon from "./polygraph-white.svg";
import supersetIcon from "./superset.svg";
import vibeIcon from "./vibe.svg";

export interface PresetIconSet {
	light: string;
	dark: string;
}

export const PRESET_ICONS: Record<string, PresetIconSet> = {
	amp: { light: ampIcon, dark: ampIcon },
	claude: { light: claudeIcon, dark: claudeIcon },
	codex: { light: codexIcon, dark: codexWhiteIcon },
	copilot: { light: copilotIcon, dark: copilotWhiteIcon },
	gemini: { light: geminiIcon, dark: geminiIcon },
	kimi: { light: kimiIcon, dark: kimiWhiteIcon },
	pi: { light: piIcon, dark: piWhiteIcon },
	polygraph: { light: polygraphIcon, dark: polygraphWhiteIcon },
	superset: { light: supersetIcon, dark: supersetIcon },
	"cursor-agent": { light: cursorAgentIcon, dark: cursorAgentIcon },
	droid: { light: droidIcon, dark: droidWhiteIcon },
	mastracode: { light: mastracodeIcon, dark: mastracodeWhiteIcon },
	opencode: { light: opencodeIcon, dark: opencodeWhiteIcon },
	vibe: { light: vibeIcon, dark: vibeIcon },
};

/** True when a value is an inline `data:` image URI rather than a preset key. */
export function isDataImageUri(value: string): boolean {
	return value.startsWith("data:image/");
}

export function getPresetIcon(
	presetName: string,
	isDark: boolean,
): string | undefined {
	// A user-uploaded icon is stored as a `data:` URI rather than a preset key.
	// Return it as-is (before normalizing — base64 is case-sensitive) so every
	// icon render site handles uploaded images without extra branching.
	if (isDataImageUri(presetName)) return presetName;
	const normalizedName = presetName.toLowerCase().trim();
	const iconSet = PRESET_ICONS[normalizedName];
	if (!iconSet) return undefined;
	return isDark ? iconSet.dark : iconSet.light;
}

export {
	ampIcon,
	claudeIcon,
	codexIcon,
	codexWhiteIcon,
	copilotIcon,
	copilotWhiteIcon,
	cursorAgentIcon,
	droidIcon,
	droidWhiteIcon,
	geminiIcon,
	kimiIcon,
	kimiWhiteIcon,
	mastracodeIcon,
	mastracodeWhiteIcon,
	opencodeIcon,
	opencodeWhiteIcon,
	piIcon,
	piWhiteIcon,
	polygraphIcon,
	polygraphWhiteIcon,
	supersetIcon,
	vibeIcon,
};
