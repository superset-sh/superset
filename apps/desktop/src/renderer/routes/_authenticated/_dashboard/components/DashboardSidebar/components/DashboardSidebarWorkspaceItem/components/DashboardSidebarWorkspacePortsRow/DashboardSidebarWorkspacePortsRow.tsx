import { cn } from "@superset/ui/utils";
import { DashboardSidebarChipStrip } from "../../../../components/DashboardSidebarChipStrip";
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
		<DashboardSidebarChipStrip
			// pl lines the chips up with the summary label text above.
			className={cn("pr-2", isInSection ? "pl-11" : "pl-9")}
		>
			{group.ports.map((port) => (
				<DashboardSidebarPortBadge
					key={`${port.hostId}:${port.terminalId}:${port.port}`}
					port={port}
				/>
			))}
		</DashboardSidebarChipStrip>
	);
}
