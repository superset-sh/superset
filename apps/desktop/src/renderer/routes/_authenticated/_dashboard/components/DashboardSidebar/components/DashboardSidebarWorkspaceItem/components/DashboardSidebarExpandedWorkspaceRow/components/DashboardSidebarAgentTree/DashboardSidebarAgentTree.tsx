import type { DashboardSidebarWorkspaceIndentation } from "../../../../../../types";
import { useDashboardSidebarWorkspaceAgentTree } from "../../hooks/useDashboardSidebarWorkspaceAgentTree";
import { DashboardSidebarAgentTreeRows } from "./components/DashboardSidebarAgentTreeRows";

interface DashboardSidebarAgentTreeProps {
	workspaceId: string;
	isInSection?: boolean;
	indentation?: DashboardSidebarWorkspaceIndentation;
}

/**
 * The workspace's agent tree as sidebar rows under the activity line, kept
 * open by the "Show tree in sidebar" switch on the agents chip's card. The
 * switch subscription lives in the rows so only workspaces with a chip pay
 * for a live query on their local-state row.
 */
export function DashboardSidebarAgentTree({
	workspaceId,
	isInSection = false,
	indentation,
}: DashboardSidebarAgentTreeProps) {
	const agentTree = useDashboardSidebarWorkspaceAgentTree(workspaceId);
	if (agentTree.agents.length === 0) return null;
	return (
		<DashboardSidebarAgentTreeRows
			workspaceId={workspaceId}
			agentTree={agentTree}
			isInSection={isInSection}
			indentation={indentation}
		/>
	);
}
