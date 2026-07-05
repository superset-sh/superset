import type { ResolvedAgentConfig } from "@superset/shared/agent-settings";

export interface AgentCardProps {
	preset: ResolvedAgentConfig;
	showEnabled: boolean;
	showCommands: boolean;
	showTaskPrompts: boolean;
}

export type AgentEditableField =
	| "label"
	| "description"
	| "command"
	| "promptCommand"
	| "promptCommandSuffix"
	| "taskPromptTemplate"
	| "model";
