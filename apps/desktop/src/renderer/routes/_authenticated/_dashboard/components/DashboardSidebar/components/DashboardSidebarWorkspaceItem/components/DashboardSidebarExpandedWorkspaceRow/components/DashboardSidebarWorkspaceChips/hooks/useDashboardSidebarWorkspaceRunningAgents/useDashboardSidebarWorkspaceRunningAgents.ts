import {
	AGENT_IDENTITY_LABELS,
	type AgentIdentityId,
} from "@superset/shared/agent-catalog";
import { useMemo } from "react";
import { useTerminalAgentBindings } from "renderer/hooks/host-service/useTerminalAgentBindings";
import { useTerminalAgentStatuses } from "renderer/hooks/host-service/useTerminalAgentStatuses";
import type { V2NotificationSource } from "renderer/stores/v2-notifications";
import type { PaneStatus } from "shared/tabs-types";

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
	/** Agent identity id (`claude`, `codex`, …) — drives label + icon. */
	agentId: AgentIdentityId;
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
	const statuses = useTerminalAgentStatuses(workspaceId, { enabled });

	return useMemo(() => {
		const agents: DashboardSidebarRunningAgent[] = [];
		for (const binding of bindings.values()) {
			agents.push({
				sourceKey: `terminal:${binding.terminalId}`,
				source: { type: "terminal", id: binding.terminalId },
				terminalId: binding.terminalId,
				agentId: binding.agentId,
				status: statuses.get(binding.terminalId) ?? "idle",
				startedAt: binding.startedAt,
				label: AGENT_IDENTITY_LABELS[binding.agentId] ?? binding.agentId,
			});
		}
		agents.sort((a, b) => a.startedAt - b.startedAt);
		return agents;
	}, [bindings, statuses]);
}
