import type {
	AgentDefinitionId,
	AgentIdentityId,
} from "@superset/shared/agent-catalog";

export type TerminalAgentId = AgentIdentityId;

/**
 * Why the agent session ended. "detached" means the agent reported its own
 * end (SessionEnd hook / wrapper exit report) — the user closed it, so it is
 * not a resume candidate. "terminal-exited" means the terminal died under it
 * (kill, crash, daemon death, reboot) without the agent saying goodbye — the
 * session is a resume candidate via the agent's resume args.
 */
export type TerminalAgentEndReason = "detached" | "terminal-exited";

/**
 * One agent process bound to a terminal. Created on the first hook event we
 * receive for the terminal. When the agent or terminal ends the row is kept
 * with `endedAt`/`endReason` set (so `agentSessionId` survives for resume)
 * and disappears from live reads; it is deleted when its terminal row is
 * deleted or a new agent session starts in the same terminal (upsert).
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
	endedAt?: number;
	endReason?: TerminalAgentEndReason;
}
