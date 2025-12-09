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
	{ key: "name", label: "Name", placeholder: "Preset name" },
	{ key: "cwd", label: "CWD", placeholder: "Working directory", mono: true },
	{ key: "commands", label: "Commands", placeholder: "Command...", mono: true },
];
