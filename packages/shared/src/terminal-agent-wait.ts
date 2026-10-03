/**
 * Statuses a caller can block on. working, permission, failed and idle are
 * what the desktop derives from a binding's last hook event (see
 * `agentStatusFromEvent`), with "review" folded into "idle" because a CLI has
 * no pane to mark a finished turn seen. "attached" is the event that
 * derivation has no status for: the agent is up but has not started a turn
 * since it attached (a fresh launch before its prompt is picked up, or a
 * resumed session sitting at its prompt), which must not pass for a finished
 * turn. "ended" is the persisted end state the desktop's live reads hide.
 */
export const TERMINAL_AGENT_WAIT_STATUSES = [
	"attached",
	"working",
	"permission",
	"failed",
	"idle",
	"ended",
] as const;

export type TerminalAgentWaitStatus =
	(typeof TERMINAL_AGENT_WAIT_STATUSES)[number];

export const DEFAULT_TERMINAL_AGENT_WAIT_UNTIL: readonly TerminalAgentWaitStatus[] =
	["idle", "permission", "failed", "ended"];

export function isTerminalAgentWaitStatus(
	value: unknown,
): value is TerminalAgentWaitStatus {
	return (
		typeof value === "string" &&
		(TERMINAL_AGENT_WAIT_STATUSES as readonly string[]).includes(value)
	);
}

/** A wait is one request held open; the host refuses anything longer. */
export const MAX_TERMINAL_AGENT_WAIT_TIMEOUT_MS = 600_000;

/**
 * A request relayed to another machine is cut by the relay once it has been
 * open about 65 s (`EXCHANGE_TIMEOUT_MS` in apps/relay/src/http-exchange.ts),
 * before the host's own TIMEOUT could answer. Remote waits stay under this and
 * the caller loops.
 */
export const MAX_REMOTE_TERMINAL_AGENT_WAIT_TIMEOUT_MS = 55_000;

export const DEFAULT_TERMINAL_AGENT_WAIT_TIMEOUT_MS = 45_000;
