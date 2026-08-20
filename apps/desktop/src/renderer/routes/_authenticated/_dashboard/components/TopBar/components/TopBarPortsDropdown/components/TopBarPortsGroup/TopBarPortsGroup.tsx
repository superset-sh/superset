import { toast } from "@superset/ui/sonner";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { useNavigate } from "@tanstack/react-router";
import { LuLoaderCircle, LuX } from "react-icons/lu";
import { useDashboardSidebarPortKill } from "renderer/routes/_authenticated/_dashboard/components/DashboardSidebar/hooks/useDashboardSidebarPortKill";
import type { DashboardSidebarPortGroup } from "renderer/routes/_authenticated/_dashboard/components/DashboardSidebar/hooks/useDashboardSidebarPortsData";
import { navigateToV2Workspace } from "renderer/routes/_authenticated/_dashboard/utils/workspace-navigation";
import { STROKE_WIDTH } from "renderer/screens/main/components/WorkspaceSidebar/constants";
import { TopBarPortRow } from "../TopBarPortRow";

interface TopBarPortsGroupProps {
	group: DashboardSidebarPortGroup;
	onNavigate: () => void;
}

/**
 * One workspace's ports in the top-bar dropdown: a header that navigates to
 * the workspace (with a hover-revealed close-all for the group), then a row
 * per port.
 */
export function TopBarPortsGroup({ group, onNavigate }: TopBarPortsGroupProps) {
	const navigate = useNavigate();
	const { isPending, killPorts } = useDashboardSidebarPortKill();

	const handleWorkspaceClick = () => {
		void navigateToV2Workspace(group.workspaceId, navigate);
		onNavigate();
	};

	const handleCloseAll = async () => {
		if (isPending) return;
		const results = await killPorts(group.ports);
		const closedCount = results.filter((result) => result.success).length;
		if (closedCount > 0) {
			toast.success(
				closedCount === 1 ? "Closed 1 port" : `Closed ${closedCount} ports`,
			);
		}
	};

	return (
		<div className="pb-1">
			<div className="group/wsheader flex items-center gap-1.5 px-2 pt-1.5 pb-0.5">
				<button
					type="button"
					onClick={handleWorkspaceClick}
					className="truncate font-medium text-[11px] text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:text-foreground"
				>
					{group.workspaceName}
				</button>
				{group.hostType !== "local-device" && (
					<span className="shrink-0 font-mono text-[9px] text-muted-foreground/60 uppercase">
						remote
					</span>
				)}
				<Tooltip delayDuration={300}>
					<TooltipTrigger asChild>
						<button
							type="button"
							onClick={() => void handleCloseAll()}
							disabled={isPending}
							aria-busy={isPending}
							aria-label={`Close all ports for ${group.workspaceName}`}
							className="ml-auto shrink-0 rounded p-0.5 text-muted-foreground opacity-0 transition-opacity hover:bg-destructive/10 hover:text-destructive focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring group-hover/wsheader:opacity-100 disabled:pointer-events-none disabled:opacity-60"
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
					<TooltipContent side="top">
						<p className="text-xs">Close all ports in this workspace</p>
					</TooltipContent>
				</Tooltip>
			</div>
			{group.ports.map((port) => (
				<TopBarPortRow
					key={`${port.hostId}:${port.terminalId}:${port.port}`}
					port={port}
					onNavigate={onNavigate}
				/>
			))}
		</div>
	);
}
