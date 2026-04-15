import type { PromptTransport } from "./agent-prompt-launch";
import {
	DEFAULT_CONTEXT_PROMPT_TEMPLATE_SYSTEM,
	DEFAULT_CONTEXT_PROMPT_TEMPLATE_USER,
} from "./agent-prompt-template";

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
	/**
	 * Mustache template with AGENT_CONTEXT_PROMPT_VARIABLES. Rendered into
	 * the system portion of the V2 AgentLaunchSpec (cacheable, stable
	 * content like AGENTS.md).
	 */
	contextPromptTemplateSystem: string;
	/**
	 * Mustache template with AGENT_CONTEXT_PROMPT_VARIABLES. Rendered into
	 * the user portion of the V2 AgentLaunchSpec (per-launch content:
	 * user prompt, linked issues/PRs/tasks, attachments).
	 */
	contextPromptTemplateUser: string;
}

export interface TerminalAgentDefinition extends BaseAgentDefinition {
	kind: "terminal";
	command: string;
	promptCommand: string;
	promptCommandSuffix?: string;
	promptTransport: PromptTransport;
}

export interface TerminalAgentDefinitionInput
	extends Omit<
		TerminalAgentDefinition,
		| "promptCommand"
		| "promptTransport"
		| "contextPromptTemplateSystem"
		| "contextPromptTemplateUser"
	> {
	promptCommand?: string;
	promptTransport?: PromptTransport;
	contextPromptTemplateSystem?: string;
	contextPromptTemplateUser?: string;
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
		contextPromptTemplateSystem:
			input.contextPromptTemplateSystem ??
			DEFAULT_CONTEXT_PROMPT_TEMPLATE_SYSTEM,
		contextPromptTemplateUser:
			input.contextPromptTemplateUser ?? DEFAULT_CONTEXT_PROMPT_TEMPLATE_USER,
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
