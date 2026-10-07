import { useWorkspaceOpenInTarget } from "../../hooks/useWorkspaceOpenInTarget";
import { V2OpenInMenuButton } from "../V2OpenInMenuButton";

interface V2WorkspaceOpenInButtonProps {
	workspaceId: string;
}

export function V2WorkspaceOpenInButton({
	workspaceId,
}: V2WorkspaceOpenInButtonProps) {
	const target = useWorkspaceOpenInTarget(workspaceId);
	if (!target) return null;

	return (
		<V2OpenInMenuButton
			branch={target.branch}
			worktreePath={target.worktreePath}
			projectId={target.projectId}
		/>
	);
}
