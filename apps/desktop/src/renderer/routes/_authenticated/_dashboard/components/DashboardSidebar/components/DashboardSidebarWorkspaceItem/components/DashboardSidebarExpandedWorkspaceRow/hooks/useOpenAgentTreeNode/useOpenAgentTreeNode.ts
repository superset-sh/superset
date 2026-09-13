import { useNavigate } from "@tanstack/react-router";
import { useCallback } from "react";
import type { AgentTreeNode } from "renderer/routes/_authenticated/_dashboard/components/AgentTree";
import {
	buildSubagentSearch,
	navigateToV2Workspace,
} from "renderer/routes/_authenticated/_dashboard/utils/workspace-navigation";
import type { DashboardSidebarRunningAgent } from "../../components/DashboardSidebarWorkspaceChips/hooks/useDashboardSidebarWorkspaceRunningAgents";

/**
 * Opens a tree node from the sidebar: an agent focuses its terminal pane, a
 * subagent opens its live transcript pane, both via the workspace route so
 * it works from any workspace.
 */
export function useOpenAgentTreeNode(
	workspaceId: string,
	agents: readonly DashboardSidebarRunningAgent[],
): (node: AgentTreeNode) => void {
	const navigate = useNavigate();
	return useCallback(
		(node: AgentTreeNode) => {
			const focusRequestId = crypto.randomUUID();
			if (node.kind === "agent" || node.subagentId === undefined) {
				void navigateToV2Workspace(workspaceId, navigate, {
					search: { terminalId: node.terminalId, focusRequestId },
				});
				return;
			}
			const agent = agents.find(
				(candidate) => candidate.terminalId === node.terminalId,
			);
			if (!agent) return;
			void navigateToV2Workspace(workspaceId, navigate, {
				search: {
					...buildSubagentSearch({
						terminalId: node.terminalId,
						subagentId: node.subagentId,
						agentId: agent.agentId,
						...(node.subtitle ? { agentType: node.subtitle } : {}),
					}),
					focusRequestId,
				},
			});
		},
		[agents, navigate, workspaceId],
	);
}
