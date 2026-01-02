import { BranchIndicator } from "./BranchIndicator";
import { OpenInMenuButton } from "./OpenInMenuButton";
import { ViewModeToggleCompact } from "./ViewModeToggleCompact";

interface WorkspaceControlsProps {
	workspaceId: string | undefined;
	worktreePath: string | undefined;
	branch: string | undefined;
}

export function WorkspaceControls({
	workspaceId,
	worktreePath,
	branch,
}: WorkspaceControlsProps) {
	// Don't render if no active workspace with a worktree path
	if (!workspaceId || !worktreePath) return null;

	return (
		<div className="flex items-center gap-2 no-drag">
			<BranchIndicator branch={branch} />
			<OpenInMenuButton worktreePath={worktreePath} />
			<ViewModeToggleCompact workspaceId={workspaceId} />
		</div>
	);
}
