interface WorkspaceControlsProps {
	workspaceId?: string | undefined;
}

export function WorkspaceControls({ workspaceId }: WorkspaceControlsProps) {
	if (!workspaceId) return null;

	// TODO: Add ViewModeToggleCompact when implemented
	return null;
}
