import { trpc } from "renderer/lib/trpc";
import { OpenInMenuButton } from "./OpenInMenuButton";

export function WorkspaceControls() {
	const { data: activeWorkspace } = trpc.workspaces.getActive.useQuery();
	const worktreePath = activeWorkspace?.worktreePath;

	if (!worktreePath) return null;

	return (
		<div className="flex items-center gap-2 no-drag">
			<OpenInMenuButton worktreePath={worktreePath} />
		</div>
	);
}
