import type {
	AgentDefinitionId,
	BuiltinAgentId,
} from "@superset/shared/agent-catalog";

export type TerminalAgentId = BuiltinAgentId;

/**
 * One live agent process bound to a terminal. Created on the first hook
 * event we receive for the terminal, deleted when the terminal exits or
 * the agent process exits.
 */
export interface TerminalAgentBinding {
	terminalId: string;
	workspaceId: string;
	agentId: TerminalAgentId;
	agentSessionId?: string;
	definitionId?: AgentDefinitionId;
	startedAt: number;
	lastEventAt: number;
	lastEventType: string;
}
