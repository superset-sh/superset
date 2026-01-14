import { useNavigate } from "@tanstack/react-router";
import { navigateToWorkspace } from "renderer/routes/_authenticated/_dashboard/utils/workspace-navigation";
import type { MergedWorkspaceGroup } from "../../hooks/usePortsData";
import { MergedPortBadge } from "../MergedPortBadge";

interface WorkspacePortGroupProps {
	group: MergedWorkspaceGroup;
}

export function WorkspacePortGroup({ group }: WorkspacePortGroupProps) {
	const navigate = useNavigate();

	const handleWorkspaceClick = () => {
		navigateToWorkspace(group.workspaceId, navigate);
	};

	return (
		<div>
			<button
				type="button"
				onClick={handleWorkspaceClick}
				className="text-xs px-3 py-1 truncate text-left w-full transition-colors text-muted-foreground hover:text-sidebar-foreground cursor-pointer"
			>
				{group.workspaceName}
			</button>
			<div className="flex flex-wrap gap-1 px-3">
				{group.ports.map((port) => (
					<MergedPortBadge key={port.port} port={port} />
				))}
			</div>
		</div>
	);
}
