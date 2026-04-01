import type { PromptTransport } from "./agent-prompt-launch";

export type AgentDefinitionSource = "builtin" | "user";
export type AgentKind = "terminal" | "chat";

interface BaseAgentDefinition {
	id: string;
	source: AgentDefinitionSource;
	kind: AgentKind;
	label: string;
	description?: string;
	enabled: boolean;
	taskPromptTemplate: string;
}

export interface TerminalAgentDefinition extends BaseAgentDefinition {
	kind: "terminal";
	command: string;
	promptCommand: string;
	promptCommandSuffix?: string;
	promptTransport: PromptTransport;
}

export interface TerminalAgentDefinitionInput
	extends Omit<TerminalAgentDefinition, "promptCommand" | "promptTransport"> {
	promptCommand?: string;
	promptTransport?: PromptTransport;
}

export interface ChatAgentDefinition extends BaseAgentDefinition {
	kind: "chat";
	model?: string;
}

export type AgentDefinition = TerminalAgentDefinition | ChatAgentDefinition;

export function createTerminalAgentDefinition(
	input: TerminalAgentDefinitionInput,
): TerminalAgentDefinition {
	return {
		...input,
		promptCommand: input.promptCommand ?? input.command,
		promptTransport: input.promptTransport ?? "argv",
	};
}

export function isTerminalAgentDefinition(
	definition: AgentDefinition,
): definition is TerminalAgentDefinition {
	return definition.kind === "terminal";
}

export function isChatAgentDefinition(
	definition: AgentDefinition,
): definition is ChatAgentDefinition {
	return definition.kind === "chat";
}
