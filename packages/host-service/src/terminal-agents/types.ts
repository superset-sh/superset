import type {
	AgentDefinitionId,
	AgentIdentityId,
} from "@superset/shared/agent-catalog";

export type TerminalAgentId = AgentIdentityId;

/**
 * Why the agent session ended.
 *
 * This decides *auto-resume eligibility* — whether Superset may bring the
 * session back into a pane on its own — and nothing more. It is not a claim
 * about the provider conversation: `agentSessionId` survives every reason
 * here, and an orchestrator holding that id can always relaunch the
 * conversation deliberately with `agents create --resume-session`. See
 * `@superset/shared/agent-session-identity` for that second, broader
 * question.
 *
 * "detached" means the agent reported its own end (SessionEnd hook / wrapper
 * exit report) — the user closed it, so nothing should reappear unasked.
 * "terminal-exited" means the terminal died under it (kill, crash, daemon
 * death, reboot) without the agent saying goodbye — the one case auto-resume
 * acts on. "resumed" means that candidate was consumed: the session
 * relaunched in a fresh terminal, so this row must never auto-resume again.
 * "disposed" means the session was killed deliberately (pane close, CLI
 * kill) — auto-resume must not resurrect it, and unlike "detached" it never
 * upgrades to a candidate.
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
