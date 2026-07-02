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
		<div
			className={cn(
				"flex flex-wrap gap-1 pr-2 pb-1",
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
		</div>
	);
}
