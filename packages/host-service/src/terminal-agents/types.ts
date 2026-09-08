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
 * The failure class a `Failed` event carried, when the hook forwarded one
 * (Claude Code's `StopFailure` error). In-memory only — it is a hint for the
 * account engine's limit-stop corroboration, never persisted or displayed.
 */
export interface TerminalAgentFailure {
	errorType: string;
	at: number;
}

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
export interface TerminalSubagent {
	id: string;
	/** Harness agent type (`Explore`, `general-purpose`, a Codex role), if reported. */
	agentType?: string;
	startedAt: number;
	lastEventAt: number;
	/** The child's own transcript on disk, once a hook event revealed it. */
	transcriptPath?: string;
	/** Set once the child reported its stop; such entries leave `subagents`. */
	endedAt?: number;
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
	/** Last failure reported for this terminal, if any. */
	lastFailure?: TerminalAgentFailure;
	/** When the agent last moved from busy (Start/PermissionRequest) to
	 * stopped (Stop/Failed) — the moment a limit stop would have happened. */
	lastTransitionAt?: number;
	endedAt?: number;
	endReason?: TerminalAgentEndReason;
	/** Live subagents under this agent, oldest first. Absent when none. */
	subagents?: TerminalSubagent[];
}
