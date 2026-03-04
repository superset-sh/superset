import {
	AGENT_PRESET_COMMANDS,
	AGENT_PRESET_DESCRIPTIONS,
	AGENT_TYPES,
} from "@superset/shared/agent-command";

export type AutoApplyField = "applyOnWorkspaceCreated" | "applyOnNewTab";

export interface PresetTemplate {
	name: string;
	preset: {
		name: string;
		description: string;
		cwd: string;
		commands: string[];
	};
}

export const PRESET_TEMPLATES: PresetTemplate[] = AGENT_TYPES.map((agent) => ({
	name: agent,
	preset: {
		name: agent,
		description: AGENT_PRESET_DESCRIPTIONS[agent],
		cwd: "",
		commands: AGENT_PRESET_COMMANDS[agent],
	},
}));
