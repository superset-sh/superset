import type { TerminalPreset } from "main/lib/db/schemas";

export type { TerminalPreset };

export type PresetColumnKey = Exclude<keyof TerminalPreset, "id">;

export interface PresetColumnConfig {
	key: PresetColumnKey;
	label: string;
	placeholder: string;
	mono?: boolean;
}

export const PRESET_COLUMNS: PresetColumnConfig[] = [
	{ key: "name", label: "Name", placeholder: "Preset name (i.e. Dev Server)" },
	{
		key: "cwd",
		label: "CWD",
		placeholder: "Working directory (i.e. ./src). Defaults to workspace root",
		mono: true,
	},
	{
		key: "commands",
		label: "Commands",
		placeholder:
			"Commands to run at startup (i.e. npm run dev). Enter to add more commands.",
		mono: true,
	},
];
