import { OpenInMenuButton } from "./OpenInMenuButton";

interface WorkspaceControlsProps {
	worktreePath: string | undefined;
}

export function WorkspaceControls({ worktreePath }: WorkspaceControlsProps) {
	// Don't render if no active workspace with a worktree path
	if (!worktreePath) return null;

	return (
		<div className="flex items-center gap-2 no-drag">
			<OpenInMenuButton worktreePath={worktreePath} />
		</div>
	);
}
