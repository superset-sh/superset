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
 * Live `terminalId → AgentIdentity` map populated from `agent:lifecycle`
 * events. Replaced on a different `agentId`/`sessionId` (e.g. `claude` →
 * `/exit` → `codex`), cleared on terminal exit. Not persisted — the worst
 * case is a brief icon flicker until the next event.
 */
export const useV2AgentBindingStore = create<V2AgentBindingState>((set) => ({
	byTerminalId: {},
	setBinding: (terminalId, identity, occurredAt) =>
		set((state) => {
			const existing = state.byTerminalId[terminalId];
			if (existing && existing.lastEventAt > occurredAt) {
				return state;
			}
			if (
				existing &&
				existing.identity.agentId === identity.agentId &&
				existing.identity.sessionId === identity.sessionId &&
				existing.identity.definitionId === identity.definitionId
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
