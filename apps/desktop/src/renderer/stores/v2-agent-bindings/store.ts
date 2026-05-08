import type { AgentIdentity } from "@superset/workspace-client";
import { create } from "zustand";

export interface V2AgentBinding {
	identity: AgentIdentity;
	lastEventAt: number;
}

export interface V2AgentBindingState {
	byTerminalId: Record<string, V2AgentBinding>;
	setBinding: (
		terminalId: string,
		identity: AgentIdentity,
		occurredAt: number,
	) => void;
	clearBinding: (terminalId: string) => void;
}

/**
 * Live mapping from terminalId → the agent currently running in that
 * terminal, populated from `agent:lifecycle` host-service events.
 *
 * Entries are written on every lifecycle event that carries an
 * `AgentIdentity` (Start, Stop, PermissionRequest), retained until the
 * terminal exits, and replaced when the same terminal reports a different
 * `agentId` or `sessionId` (e.g. user runs `claude` then `/exit` then `codex`).
 *
 * Not persisted: a refresh rebuilds the map on the next agent event.
 * Acceptable because the binding only drives the optional pane-header
 * icon — no data is lost when it's briefly missing.
 */
export const useV2AgentBindingStore = create<V2AgentBindingState>((set) => ({
	byTerminalId: {},
	setBinding: (terminalId, identity, occurredAt) =>
		set((state) => {
			const existing = state.byTerminalId[terminalId];
			if (
				existing &&
				existing.identity.agentId === identity.agentId &&
				existing.identity.sessionId === identity.sessionId &&
				existing.identity.definitionId === identity.definitionId &&
				existing.lastEventAt >= occurredAt
			) {
				return state;
			}
			return {
				byTerminalId: {
					...state.byTerminalId,
					[terminalId]: { identity, lastEventAt: occurredAt },
				},
			};
		}),
	clearBinding: (terminalId) =>
		set((state) => {
			if (!(terminalId in state.byTerminalId)) return state;
			const next = { ...state.byTerminalId };
			delete next[terminalId];
			return { byTerminalId: next };
		}),
}));

export function selectV2AgentBinding(
	terminalId: string,
): (state: V2AgentBindingState) => V2AgentBinding | undefined {
	return (state) => state.byTerminalId[terminalId];
}
