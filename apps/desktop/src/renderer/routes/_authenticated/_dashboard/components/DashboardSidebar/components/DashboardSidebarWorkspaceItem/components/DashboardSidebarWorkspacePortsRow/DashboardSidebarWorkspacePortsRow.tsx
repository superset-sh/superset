import { OverflowFadeContainer } from "@superset/ui/overflow-fade-container";
import { cn } from "@superset/ui/utils";
import { useDashboardSidebarWorkspacePorts } from "../../../../providers/DashboardSidebarPortsProvider";
import { DashboardSidebarPortBadge } from "../../../DashboardSidebarPortsList/components/DashboardSidebarPortBadge";

interface DashboardSidebarWorkspacePortsRowProps {
	workspaceId: string;
	isInSection?: boolean;
}

export function DashboardSidebarWorkspacePortsRow({
	workspaceId,
	isInSection = false,
}: DashboardSidebarWorkspacePortsRowProps) {
	const group = useDashboardSidebarWorkspacePorts(workspaceId);

	if (!group || group.ports.length === 0) {
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
			{group.ports.map((port) => (
				<DashboardSidebarPortBadge
					key={`${port.hostId}:${port.terminalId}:${port.port}`}
					port={port}
				/>
			))}
		</OverflowFadeContainer>
	);
}
