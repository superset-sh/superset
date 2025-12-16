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
	{ key: "name", label: "Name", placeholder: "e.g. Dev Server" },
	{
		key: "description",
		label: "Description",
		placeholder: "e.g. Starts the dev server (optional)",
	},
	{
		key: "cwd",
		label: "CWD",
		placeholder: "e.g. ./src (optional)",
		mono: true,
	},
	{
		key: "commands",
		label: "Commands",
		placeholder: "e.g. npm run dev",
		mono: true,
	},
];
