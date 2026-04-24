import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { useNavigate } from "@tanstack/react-router";
import { LuX } from "react-icons/lu";
import { navigateToV2Workspace } from "renderer/routes/_authenticated/_dashboard/utils/workspace-navigation";
import { STROKE_WIDTH } from "renderer/screens/main/components/WorkspaceSidebar/constants";
import { useDashboardSidebarPortKill } from "../../hooks/useDashboardSidebarPortKill";
import type { DashboardSidebarPortGroup as DashboardSidebarPortGroupType } from "../../hooks/useDashboardSidebarPortsData";
import { DashboardSidebarPortBadge } from "../DashboardSidebarPortBadge";

interface DashboardSidebarPortGroupProps {
	group: DashboardSidebarPortGroupType;
}

export function DashboardSidebarPortGroup({
	group,
}: DashboardSidebarPortGroupProps) {
	const navigate = useNavigate();
	const { killPorts } = useDashboardSidebarPortKill();

	const handleWorkspaceClick = () => {
		void navigateToV2Workspace(group.workspaceId, navigate);
	};

	const handleCloseAll = () => {
		void killPorts(group.ports);
	};

	return (
		<div>
			<div className="group flex items-center px-3 py-1">
				<button
					type="button"
					onClick={handleWorkspaceClick}
					className="truncate text-left text-xs text-muted-foreground transition-colors hover:text-sidebar-foreground"
				>
					{group.workspaceName}
				</button>
				<span className="ml-1.5 rounded bg-muted px-1 py-0.5 text-[9px] uppercase leading-none text-muted-foreground">
					{group.hostType === "local-device" ? "Local" : "Remote"}
				</span>
				<Tooltip>
					<TooltipTrigger asChild>
						<button
							type="button"
							onClick={handleCloseAll}
							className="ml-auto rounded p-0.5 text-muted-foreground hover:bg-muted/50 hover:text-primary"
						>
							<LuX className="size-3" strokeWidth={STROKE_WIDTH} />
						</button>
					</TooltipTrigger>
					<TooltipContent side="top" sideOffset={4}>
						<p className="text-xs">Close all ports</p>
					</TooltipContent>
				</Tooltip>
			</div>
			<div className="flex flex-wrap gap-1 px-3">
				{group.ports.map((port) => (
					<DashboardSidebarPortBadge
						key={`${port.hostId}:${port.paneId}:${port.port}`}
						port={port}
					/>
				))}
			</div>
		</div>
	);
}
