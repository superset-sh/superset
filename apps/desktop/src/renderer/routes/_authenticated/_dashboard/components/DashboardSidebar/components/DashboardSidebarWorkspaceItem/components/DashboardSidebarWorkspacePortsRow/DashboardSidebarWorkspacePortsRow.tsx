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
		<div
			className={cn(
				"flex flex-wrap gap-1 pr-2 pb-1",
				isInSection ? "pl-14" : "pl-12",
			)}
		>
			{group.ports.map((port) => (
				<DashboardSidebarPortBadge
					key={`${port.hostId}:${port.terminalId}:${port.port}`}
					port={port}
				/>
			))}
		</div>
	);
}
