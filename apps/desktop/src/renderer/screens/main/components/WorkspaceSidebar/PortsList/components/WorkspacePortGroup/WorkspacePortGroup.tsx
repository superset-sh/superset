import { trpc } from "renderer/lib/trpc";
import type { MergedWorkspaceGroup } from "../../hooks/usePortsData";
import { MergedPortBadge } from "../MergedPortBadge";

interface WorkspacePortGroupProps {
	group: MergedWorkspaceGroup;
}

export function WorkspacePortGroup({ group }: WorkspacePortGroupProps) {
	const setActiveMutation = trpc.workspaces.setActive.useMutation();
	const utils = trpc.useUtils();

	const handleWorkspaceClick = async () => {
		if (group.isCurrentWorkspace) return;

		await setActiveMutation.mutateAsync({ id: group.workspaceId });
		await utils.workspaces.getActive.invalidate();
	};

	return (
		<div>
			<button
				type="button"
				onClick={handleWorkspaceClick}
				disabled={group.isCurrentWorkspace}
				className={`text-xs px-3 py-1 truncate text-left w-full transition-colors ${
					group.isCurrentWorkspace
						? "text-sidebar-foreground/80"
						: "text-muted-foreground hover:text-sidebar-foreground cursor-pointer"
				}`}
			>
				{group.workspaceName}
			</button>
			<div className="flex flex-wrap gap-1 px-3">
				{group.ports.map((port) => (
					<MergedPortBadge
						key={port.port}
						port={port}
						isCurrentWorkspace={group.isCurrentWorkspace}
					/>
				))}
			</div>
		</div>
	);
}
