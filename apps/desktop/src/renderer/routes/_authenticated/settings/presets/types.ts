import type { TerminalPreset } from "@superset/local-db";

export type { TerminalPreset };

export type PresetColumnKey = "name" | "description" | "cwd";

export interface PresetColumnConfig {
	key: PresetColumnKey;
	label: string;
	placeholder: string;
	mono?: boolean;
	tooltip?: string;
}

export const PRESET_COLUMNS: PresetColumnConfig[] = [
	{ key: "name", label: "Name", placeholder: "e.g. Dev Server" },
	{
		key: "description",
		label: "Description",
		placeholder: "e.g. Starts the dev server (optional)",
	},
	{
		key: "cwd",
		label: "Directory",
		placeholder: "e.g. ./src (optional)",
		mono: true,
		tooltip:
			"Working directory for the terminal session (relative to workspace root)",
	},
];
