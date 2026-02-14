import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { useNavigate } from "@tanstack/react-router";
import { LuX } from "react-icons/lu";
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
	const { killPorts } = useKillPort();

	const handleWorkspaceClick = () => {
		navigateToWorkspace(group.workspaceId, navigate);
	};

	const handleCloseAll = () => {
		killPorts(group.ports);
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
							className="ml-auto p-0.5 rounded hover:bg-muted/50 text-muted-foreground hover:text-primary"
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
					<MergedPortBadge key={port.port} port={port} />
				))}
			</div>
		</div>
	);
}
