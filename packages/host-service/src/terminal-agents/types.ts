import type {
	AgentDefinitionId,
	AgentIdentityId,
} from "@superset/shared/agent-catalog";

export type TerminalAgentId = AgentIdentityId;

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
	/**
	 * Ephemeral, never persisted — derived live from the agent's own local
	 * state (e.g. a Claude Code transcript file) and re-derivable from
	 * scratch on host-service restart, so it's kept out of the DB schema.
	 */
	cwd?: string;
	title?: string;
	color?: string;
}
