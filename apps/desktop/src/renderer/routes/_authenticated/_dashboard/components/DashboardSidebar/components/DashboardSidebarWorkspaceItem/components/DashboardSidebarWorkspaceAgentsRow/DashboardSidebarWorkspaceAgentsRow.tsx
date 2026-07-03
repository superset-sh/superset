import { cn } from "@superset/ui/utils";
import { DashboardSidebarChipStrip } from "../../../../components/DashboardSidebarChipStrip";
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
		<DashboardSidebarChipStrip
			// pl lines the chips up with the summary label text above.
			className={cn("pr-2", isInSection ? "pl-11" : "pl-9")}
		>
			{agents.map((agent) => (
				<DashboardSidebarWorkspaceAgentBadge
					key={agent.sourceKey}
					workspaceId={workspaceId}
					agent={agent}
				/>
			))}
		</DashboardSidebarChipStrip>
	);
}
