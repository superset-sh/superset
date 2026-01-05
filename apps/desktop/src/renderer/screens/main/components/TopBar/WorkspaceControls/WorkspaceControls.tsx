import { ViewModeToggleCompact } from "./ViewModeToggleCompact";

interface WorkspaceControlsProps {
	workspaceId: string | undefined;
}

export function WorkspaceControls({ workspaceId }: WorkspaceControlsProps) {
	if (!workspaceId) return null;

	return (
		<div className="flex items-center gap-2 no-drag">
			<ViewModeToggleCompact workspaceId={workspaceId} />
		</div>
	);
}
