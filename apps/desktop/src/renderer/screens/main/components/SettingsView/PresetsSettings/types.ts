export interface TerminalPreset {
	id: string;
	name: string;
	cwd: string;
	commands: string[];
}

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

export const createEmptyPreset = (): TerminalPreset => ({
	id: crypto.randomUUID(),
	name: "",
	cwd: "",
	commands: [""],
});

export const MOCK_PRESETS: TerminalPreset[] = [
	{
		id: crypto.randomUUID(),
		name: "Dev Server",
		cwd: "apps/website",
		commands: ["bun dev"],
	},
	{
		id: crypto.randomUUID(),
		name: "Build",
		cwd: ".",
		commands: ["bun run build"],
	},
	{
		id: crypto.randomUUID(),
		name: "Test",
		cwd: ".",
		commands: ["bun test"],
	},
	{
		id: crypto.randomUUID(),
		name: "Lint",
		cwd: ".",
		commands: ["bun run lint"],
	},
];
