import { useMemo } from "react";
import {
	type AgentTreeData,
	type AgentTreeNodeStatus,
	buildAgentTree,
} from "renderer/routes/_authenticated/_dashboard/components/AgentTree";
import { useWorkspaceAgentsRowEnabled } from "renderer/stores/workspace-agents-row";
import {
	type DashboardSidebarRunningAgent,
	type RunningAgentStatus,
	useDashboardSidebarWorkspaceRunningAgents,
} from "../../components/DashboardSidebarWorkspaceChips/hooks/useDashboardSidebarWorkspaceRunningAgents";

export interface DashboardSidebarWorkspaceAgentTree {
	/** Empty when the workspace has nothing worth a chip. */
	agents: DashboardSidebarRunningAgent[];
	tree: AgentTreeData;
	/** Worst state among live subagents, for the chip's `+N`. */
	childrenStatus: AgentTreeNodeStatus | undefined;
}

const EMPTY: DashboardSidebarWorkspaceAgentTree = {
	agents: [],
	tree: { live: [], ended: [] },
	childrenStatus: undefined,
};

const CHILD_STATUS_PRIORITY: Record<AgentTreeNodeStatus, number> = {
	idle: 0,
	review: 1,
	completed: 1,
	stopped: 1,
	working: 2,
	failed: 3,
	waiting: 4,
};

export function agentStatusToTreeStatus(
	status: RunningAgentStatus,
): AgentTreeNodeStatus {
	return status === "permission" ? "waiting" : status;
}

/**
 * The workspace's agents as a tree, gated the way the chip is: one agent
 * alone is what the pane already shows, so the tree exists once there is a
 * second agent or any subagent, live or recently ended.
 */
export function useDashboardSidebarWorkspaceAgentTree(
	workspaceId: string,
): DashboardSidebarWorkspaceAgentTree {
	const enabled = useWorkspaceAgentsRowEnabled();
	const runningAgents = useDashboardSidebarWorkspaceRunningAgents(workspaceId);

	return useMemo(() => {
		const hasChildren = runningAgents.some(
			(agent) => agent.subagents.length > 0 || agent.endedSubagents.length > 0,
		);
		if (!enabled || (runningAgents.length <= 1 && !hasChildren)) return EMPTY;

		const tree = buildAgentTree(
			runningAgents.map((agent) => ({
				terminalId: agent.terminalId,
				agentId: agent.agentId,
				title: agent.label,
				status: agentStatusToTreeStatus(agent.status),
				startedAt: agent.startedAt,
				subagents: agent.subagents,
				endedSubagents: agent.endedSubagents,
			})),
		);
		let childrenStatus: AgentTreeNodeStatus | undefined;
		for (const agent of runningAgents) {
			for (const subagent of agent.subagents) {
				if (
					childrenStatus === undefined ||
					CHILD_STATUS_PRIORITY[subagent.status] >
						CHILD_STATUS_PRIORITY[childrenStatus]
				) {
					childrenStatus = subagent.status;
				}
			}
		}
		return { agents: runningAgents, tree, childrenStatus };
	}, [enabled, runningAgents]);
}
