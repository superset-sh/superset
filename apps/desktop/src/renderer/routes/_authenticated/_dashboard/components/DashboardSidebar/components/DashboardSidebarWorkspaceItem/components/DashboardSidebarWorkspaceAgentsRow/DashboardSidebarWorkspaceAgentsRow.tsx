import { OverflowFadeContainer } from "@superset/ui/overflow-fade-container";
import { cn } from "@superset/ui/utils";
import { DashboardSidebarWorkspaceAgentBadge } from "./components/DashboardSidebarWorkspaceAgentBadge";
import { useDashboardSidebarWorkspaceRunningAgents } from "./hooks/useDashboardSidebarWorkspaceRunningAgents";

interface DashboardSidebarWorkspaceAgentsRowProps {
	workspaceId: string;
	isInSection?: boolean;
}

export function DashboardSidebarWorkspaceAgentsRow({
	workspaceId,
	isInSection = false,
}: DashboardSidebarWorkspaceAgentsRowProps) {
	const agents = useDashboardSidebarWorkspaceRunningAgents(workspaceId);

	if (agents.length === 0) {
		return null;
	}

	return (
		<OverflowFadeContainer
			observeChildren
			className={cn(
				"grid auto-cols-max grid-flow-col grid-rows-2 gap-1 overflow-x-auto pr-2 pb-1 hide-scrollbar",
				isInSection ? "pl-14" : "pl-12",
			)}
		>
			{agents.map((agent) => (
				<DashboardSidebarWorkspaceAgentBadge
					key={agent.sourceKey}
					workspaceId={workspaceId}
					agent={agent}
				/>
			))}
		</OverflowFadeContainer>
	);
}
