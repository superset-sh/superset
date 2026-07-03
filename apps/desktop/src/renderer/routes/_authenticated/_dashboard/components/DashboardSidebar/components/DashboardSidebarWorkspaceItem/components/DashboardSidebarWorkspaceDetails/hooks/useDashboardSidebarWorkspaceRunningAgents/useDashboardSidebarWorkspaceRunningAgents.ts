import {
	BUILTIN_AGENT_LABELS,
	type BuiltinAgentId,
} from "@superset/shared/agent-catalog";
import { useMemo } from "react";
import { useTerminalAgentBindings } from "renderer/hooks/host-service/useTerminalAgentBindings";
import {
	useV2NotificationStore,
	type V2NotificationSource,
} from "renderer/stores/v2-notifications";
import type { PaneStatus } from "shared/tabs-types";
import { useShallow } from "zustand/react/shallow";

/**
 * State of a bound agent. `idle` means the agent process is alive but not
 * currently `working` / awaiting `permission` / ready for `review`.
 */
export type RunningAgentStatus = PaneStatus;

export interface DashboardSidebarRunningAgent {
	/** Stable key for React lists, derived from the notification source. */
	sourceKey: string;
	source: V2NotificationSource;
	/** Host terminal the agent is bound to. */
	terminalId: string;
	/** Built-in agent id (`claude`, `codex`, …) — drives label + icon. */
	agentId: BuiltinAgentId;
	/** `idle` | `working` | `permission` | `review`. */
	status: RunningAgentStatus;
	/** When the agent process was bound (ms since epoch), used for stable order. */
	startedAt: number;
	/** Agent display name (e.g. "Claude"). */
	label: string;
}

/**
 * Live list of agents bound to a workspace's terminals, newest binding last.
 * Every live agent process is included regardless of state; its `status` comes
 * from the notification store (or `idle` when it has no active status).
 *
 * Mirrors {@link useDashboardSidebarWorkspacePorts} so a workspace detail row
 * can render agents the same way it renders ports.
 */
export function useDashboardSidebarWorkspaceRunningAgents(
	workspaceId: string,
	enabled = true,
): DashboardSidebarRunningAgent[] {
	const bindings = useTerminalAgentBindings(workspaceId, { enabled });

	const statusByTerminal = useV2NotificationStore(
		useShallow((state) => {
			const map: Record<string, RunningAgentStatus> = {};
			for (const entry of Object.values(state.sources)) {
				if (
					entry.workspaceId === workspaceId &&
					entry.source.type === "terminal"
				) {
					map[entry.source.id] = entry.status;
				}
			}
			return map;
		}),
	);

	return useMemo(() => {
		const agents: DashboardSidebarRunningAgent[] = [];
		for (const binding of bindings.values()) {
			agents.push({
				sourceKey: `terminal:${binding.terminalId}`,
				source: { type: "terminal", id: binding.terminalId },
				terminalId: binding.terminalId,
				agentId: binding.agentId,
				status: statusByTerminal[binding.terminalId] ?? "idle",
				startedAt: binding.startedAt,
				label: BUILTIN_AGENT_LABELS[binding.agentId] ?? binding.agentId,
			});
		}
		agents.sort((a, b) => a.startedAt - b.startedAt);
		return agents;
	}, [bindings, statusByTerminal]);
}
