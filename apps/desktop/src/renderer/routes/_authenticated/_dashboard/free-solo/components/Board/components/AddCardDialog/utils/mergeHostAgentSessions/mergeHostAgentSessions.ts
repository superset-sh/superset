import type {
	HostAgentBinding,
	HostSession,
} from "../../../HostTerminalsProbe";

export type { HostAgentBinding };

export interface HostAgentSession extends HostSession {
	agentId: string;
	lastEventType: string;
	lastEventAt: number;
}

export interface MergedHostSessions {
	/** Live sessions with a live agent binding. */
	agentSessions: HostAgentSession[];
	/** Everything else: a session with no binding, or one whose binding
	 *  ended. */
	terminalSessions: HostSession[];
}

/**
 * Splits a host's live terminal sessions into agent-bound and plain
 * terminals. Driven off `sessions`, not `bindings` — a binding whose
 * terminal has no live session (the agent's terminal already died, or the
 * two lists came from slightly different moments) contributes nothing to
 * either list, instead of manufacturing a card for a terminal that isn't
 * actually there.
 */
export function mergeHostAgentSessions(
	sessions: readonly HostSession[],
	bindings: readonly HostAgentBinding[],
): MergedHostSessions {
	// The host's own `listLive`/`listLiveByWorkspace` already filter out
	// ended bindings, but this doesn't lean on that — belt-and-suspenders
	// against a stale or differently sourced binding list.
	const liveBindingByTerminalId = new Map<string, HostAgentBinding>();
	for (const binding of bindings) {
		if (binding.endedAt != null) continue;
		liveBindingByTerminalId.set(binding.terminalId, binding);
	}

	const agentSessions: HostAgentSession[] = [];
	const terminalSessions: HostSession[] = [];
	for (const session of sessions) {
		const binding = liveBindingByTerminalId.get(session.terminalId);
		if (binding) {
			agentSessions.push({
				...session,
				agentId: binding.agentId,
				lastEventType: binding.lastEventType,
				lastEventAt: binding.lastEventAt,
			});
		} else {
			terminalSessions.push(session);
		}
	}
	return { agentSessions, terminalSessions };
}
