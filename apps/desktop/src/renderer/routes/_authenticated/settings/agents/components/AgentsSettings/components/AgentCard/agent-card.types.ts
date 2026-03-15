import type { ResolvedAgentConfig } from "shared/utils/agent-settings";

export interface AgentCardProps {
	preset: ResolvedAgentConfig;
	showEnabled: boolean;
	showCommands: boolean;
	showTaskPrompts: boolean;
}

export type AgentDraft = {
	enabled: boolean;
	label: string;
	description: string;
	command: string;
	promptCommand: string;
	promptCommandSuffix: string;
	taskPromptTemplate: string;
	model: string;
};
