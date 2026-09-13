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
 * session is a resume candidate via the agent's resume args. "resumed" means
 * the candidate was consumed: the session relaunched in a fresh terminal, so
 * this row must never resume again. "disposed" means the session was killed
 * deliberately (pane close, CLI kill) — auto-resume must not resurrect it,
 * and unlike "detached" it never upgrades to a resume candidate.
 */
export type TerminalAgentEndReason =
	| "detached"
	| "terminal-exited"
	| "resumed"
	| "disposed";

/**
 * One agent process bound to a terminal. Created on the first hook event we
 * receive for the terminal. When the agent or terminal ends the row is kept
 * with `endedAt`/`endReason` set (so `agentSessionId` survives for resume)
 * and disappears from live reads; it is deleted when its terminal row is
 * deleted or a new agent session starts in the same terminal (upsert).
 */
/**
 * A subagent the bound agent spawned (Claude Task tool, Codex spawn_agent),
 * keyed by the harness-assigned `agent_id` its hooks carry. Held in memory
 * only: it lives and dies with the parent's session, so it is never a resume
 * concern and needs no row.
 */
export type TerminalSubagentStatus =
	| "working"
	| "waiting"
	| "completed"
	| "failed"
	| "stopped";

/** "stale" means the child went quiet without a stop and the roster gave up on it. */
export type TerminalSubagentEndReason = "completed" | "stale";

export interface TerminalSubagentActivity {
	toolName: string;
	summary: string;
	at: number;
}

export interface TerminalSubagent {
	id: string;
	/** Harness agent type (`Explore`, `general-purpose`, a Codex role), if reported. */
	agentType?: string;
	/** Harness title: Claude Task description (agent-<id>.meta.json), Codex nickname/agent path (session_meta). */
	description?: string;
	/** The child's own hook session id (a Codex child's thread id). */
	sessionId?: string;
	/** Absent with parentUnknown unset = direct child of the terminal's agent. */
	parentSubagentId?: string;
	/** No harness evidence could place this child; the renderer roots it at level 1 with a dashed rail. */
	parentUnknown?: boolean;
	status: TerminalSubagentStatus;
	activity?: TerminalSubagentActivity;
	startedAt: number;
	lastEventAt: number;
	/** The child's own transcript on disk, once a hook event revealed it. */
	transcriptPath?: string;
	/** Set once the child ended; such entries move from `subagents` to `endedSubagents`. */
	endedAt?: number;
	endReason?: TerminalSubagentEndReason;
}

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
	/** Live subagents under this agent, oldest first. Absent when none. */
	subagents?: TerminalSubagent[];
	/** Children with `endedAt` set, oldest-ended first. Absent when none. */
	endedSubagents?: TerminalSubagent[];
}
