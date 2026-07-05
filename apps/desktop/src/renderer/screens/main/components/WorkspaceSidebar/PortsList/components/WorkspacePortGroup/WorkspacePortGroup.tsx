import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { cn } from "@superset/ui/utils";
import { useNavigate } from "@tanstack/react-router";
import { LuLoaderCircle, LuX } from "react-icons/lu";
import { navigateToWorkspace } from "renderer/routes/_authenticated/_dashboard/utils/workspace-navigation";
import { STROKE_WIDTH } from "../../../constants";
import { useKillPort } from "../../hooks/useKillPort";
import type { WorkspacePortGroup as WorkspacePortGroupType } from "../../hooks/usePortsData";
import { MergedPortBadge } from "../MergedPortBadge";

interface WorkspacePortGroupProps {
	group: WorkspacePortGroupType;
}

export function WorkspacePortGroup({ group }: WorkspacePortGroupProps) {
	const navigate = useNavigate();
	const { isPending, killPorts } = useKillPort();

	const handleWorkspaceClick = () => {
		navigateToWorkspace(group.workspaceId, navigate);
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
					className="text-xs truncate text-left transition-colors text-muted-foreground hover:text-sidebar-foreground cursor-pointer"
				>
					{group.workspaceName}
				</button>
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
			<div className="flex flex-wrap gap-1 px-3">
				{group.ports.map((port) => (
					<MergedPortBadge
						key={`${port.terminalId}:${port.port}`}
						port={port}
					/>
				))}
			</div>
		</div>
	);
}
