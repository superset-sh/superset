import ampIcon from "./amp.svg";
import claudeIcon from "./claude.svg";
import codexIcon from "./codex.svg";
import codexWhiteIcon from "./codex-white.svg";
import copilotIcon from "./copilot.svg";
import copilotWhiteIcon from "./copilot-white.svg";
import cursorAgentIcon from "./cursor.svg";
import geminiIcon from "./gemini.svg";
import mastracodeIcon from "./mastracode.svg";
import mastracodeWhiteIcon from "./mastracode-white.svg";
import opencodeIcon from "./opencode.svg";
import opencodeWhiteIcon from "./opencode-white.svg";
import piIcon from "./pi.svg";
import piWhiteIcon from "./pi-white.svg";
import supersetIcon from "./superset.svg";

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
	pi: { light: piIcon, dark: piWhiteIcon },
	superset: { light: supersetIcon, dark: supersetIcon },
	"superset-chat": { light: supersetIcon, dark: supersetIcon },
	"cursor-agent": { light: cursorAgentIcon, dark: cursorAgentIcon },
	mastracode: { light: mastracodeIcon, dark: mastracodeWhiteIcon },
	opencode: { light: opencodeIcon, dark: opencodeWhiteIcon },
};

/**
 * Returns true when `value` is a single emoji (or emoji sequence)
 * rather than an icon key or plain text.
 */
export function isEmoji(value: string): boolean {
	const trimmed = value.trim();
	if (trimmed.length === 0) return false;
	// Strip emoji presentation / variation selectors, ZWJ, skin-tone modifiers, and keycap
	const stripped = trimmed.replace(
		/[\u200D\uFE0E\uFE0F\u20E3\u{1F3FB}-\u{1F3FF}]/gu,
		"",
	);
	// After stripping joiners, every remaining char should be in an emoji range
	return /^[\p{Emoji_Presentation}\p{Extended_Pictographic}]+$/u.test(stripped);
}

export interface ResolvedPresetIcon {
	type: "image" | "emoji";
	value: string;
}

/**
 * Resolve the icon for a terminal preset.
 *
 * Priority:
 * 1. Explicit `iconOverride` that is an emoji → { type: "emoji", value }
 * 2. Explicit `iconOverride` that matches a PRESET_ICONS key → { type: "image", value }
 * 3. Name-based match against PRESET_ICONS → { type: "image", value }
 * 4. undefined (caller renders a generic fallback)
 */
export function resolvePresetIcon(
	presetName: string,
	isDark: boolean,
	iconOverride?: string,
): ResolvedPresetIcon | undefined {
	if (iconOverride) {
		const trimmed = iconOverride.trim();
		if (isEmoji(trimmed)) {
			return { type: "emoji", value: trimmed };
		}
		const overrideSet = PRESET_ICONS[trimmed.toLowerCase()];
		if (overrideSet) {
			return {
				type: "image",
				value: isDark ? overrideSet.dark : overrideSet.light,
			};
		}
	}

	const normalizedName = presetName.toLowerCase().trim();
	const iconSet = PRESET_ICONS[normalizedName];
	if (!iconSet) return undefined;
	return {
		type: "image",
		value: isDark ? iconSet.dark : iconSet.light,
	};
}

/** @deprecated Use `resolvePresetIcon` instead. */
export function getPresetIcon(
	presetName: string,
	isDark: boolean,
): string | undefined {
	const resolved = resolvePresetIcon(presetName, isDark);
	if (!resolved || resolved.type === "emoji") return undefined;
	return resolved.value;
}

export {
	ampIcon,
	claudeIcon,
	codexIcon,
	codexWhiteIcon,
	copilotIcon,
	copilotWhiteIcon,
	cursorAgentIcon,
	geminiIcon,
	mastracodeIcon,
	mastracodeWhiteIcon,
	opencodeIcon,
	opencodeWhiteIcon,
	piIcon,
	piWhiteIcon,
	supersetIcon,
};
