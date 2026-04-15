import type {
	AgentDefinition,
	AgentDefinitionSource,
	AgentKind,
	ChatAgentDefinition,
	TerminalAgentDefinition,
} from "./agent-definition";
import {
	DEFAULT_CHAT_TASK_PROMPT_TEMPLATE,
	DEFAULT_CONTEXT_PROMPT_TEMPLATE_SYSTEM,
	DEFAULT_CONTEXT_PROMPT_TEMPLATE_USER,
} from "./agent-prompt-template";
import {
	BUILTIN_TERMINAL_AGENT_TYPES,
	BUILTIN_TERMINAL_AGENTS,
} from "./builtin-terminal-agents";

export const BUILTIN_AGENT_IDS = [
	...BUILTIN_TERMINAL_AGENT_TYPES,
	"superset-chat",
] as const;

export type BuiltinAgentId = (typeof BUILTIN_AGENT_IDS)[number];
export type AgentDefinitionId = BuiltinAgentId | `custom:${string}`;

export type {
	AgentDefinition,
	AgentDefinitionSource,
	AgentKind,
	ChatAgentDefinition,
	TerminalAgentDefinition,
};

export const BUILTIN_AGENT_LABELS: Record<BuiltinAgentId, string> = {
	...Object.fromEntries(
		BUILTIN_TERMINAL_AGENTS.map((agent) => [agent.id, agent.label]),
	),
	"superset-chat": "Superset Chat",
} as Record<BuiltinAgentId, string>;

const BUILTIN_CHAT_AGENT: ChatAgentDefinition = {
	id: "superset-chat",
	source: "builtin",
	kind: "chat",
	label: "Superset Chat",
	description:
		"Superset's built-in workspace chat for project-aware help and task launches.",
	enabled: true,
	taskPromptTemplate: DEFAULT_CHAT_TASK_PROMPT_TEMPLATE,
	contextPromptTemplateSystem: DEFAULT_CONTEXT_PROMPT_TEMPLATE_SYSTEM,
	contextPromptTemplateUser: DEFAULT_CONTEXT_PROMPT_TEMPLATE_USER,
};

export const BUILTIN_AGENT_DEFINITIONS: AgentDefinition[] = [
	...BUILTIN_TERMINAL_AGENTS,
	BUILTIN_CHAT_AGENT,
];

export function getBuiltinAgentDefinition(id: BuiltinAgentId): AgentDefinition {
	const definition = BUILTIN_AGENT_DEFINITIONS.find((item) => item.id === id);
	if (!definition) {
		throw new Error(`Unknown built-in agent definition: ${id}`);
	}
	return definition;
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

export function isBuiltinAgentId(id: string): id is BuiltinAgentId {
	return (BUILTIN_AGENT_IDS as readonly string[]).includes(id);
}

export function isCustomAgentId(id: string): id is `custom:${string}` {
	return id.startsWith("custom:");
}
