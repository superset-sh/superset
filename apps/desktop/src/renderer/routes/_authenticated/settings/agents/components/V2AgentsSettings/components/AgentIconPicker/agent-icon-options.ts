/**
 * Built-in icon keys a user can pick for a custom agent. Each id must exist in
 * `PRESET_ICONS`. `presetId` for user agents is always `"custom"`, so the icon
 * is stored separately as `iconId` and rendered via `getPresetIcon(iconId)`.
 */
export interface AgentIconOption {
	id: string;
	label: string;
}

export const AGENT_ICON_OPTIONS: readonly AgentIconOption[] = [
	{ id: "claude", label: "Claude" },
	{ id: "codex", label: "Codex" },
	{ id: "cursor-agent", label: "Cursor" },
	{ id: "gemini", label: "Gemini" },
	{ id: "copilot", label: "Copilot" },
	{ id: "amp", label: "Amp" },
	{ id: "opencode", label: "OpenCode" },
	{ id: "droid", label: "Droid" },
	{ id: "mastracode", label: "Mastra" },
	{ id: "pi", label: "Pi" },
	{ id: "vibe", label: "Mistral Vibe" },
];
