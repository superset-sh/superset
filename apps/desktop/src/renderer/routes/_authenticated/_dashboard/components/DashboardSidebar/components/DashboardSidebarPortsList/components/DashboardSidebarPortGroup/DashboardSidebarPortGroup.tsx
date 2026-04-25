import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { cn } from "@superset/ui/utils";
import { useNavigate } from "@tanstack/react-router";
import { LuLoaderCircle, LuX } from "react-icons/lu";
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
	const { isPending, killPorts } = useDashboardSidebarPortKill();

	const handleWorkspaceClick = () => {
		void navigateToV2Workspace(group.workspaceId, navigate);
	};

	const handleCloseAll = () => {
		if (isPending) return;
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
							disabled={isPending}
							aria-busy={isPending}
							className={cn(
								"ml-auto rounded p-0.5 text-muted-foreground hover:bg-muted/50 hover:text-primary",
								"disabled:pointer-events-none disabled:opacity-60",
							)}
						>
							{isPending ? (
								<LuLoaderCircle
									className="size-3 animate-spin"
									strokeWidth={STROKE_WIDTH}
								/>
							) : (
								<LuX className="size-3" strokeWidth={STROKE_WIDTH} />
							)}
						</button>
					</TooltipTrigger>
					<TooltipContent side="top" sideOffset={4}>
						<p className="text-xs">Close all ports</p>
					</TooltipContent>
				</Tooltip>
			</div>
			<div className="fade-edge-r grid auto-cols-max grid-flow-col grid-rows-2 gap-1 overflow-x-auto px-3 pb-1 hide-scrollbar">
				{group.ports.map((port) => (
					<DashboardSidebarPortBadge
						key={`${port.hostId}:${port.terminalId}:${port.port}`}
						port={port}
					/>
				))}
			</div>
		</div>
	);
}
