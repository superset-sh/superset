import { useEffect } from "react";
import { useArchiveWorkspaceFlow } from "renderer/lib/workspaces/useArchiveWorkspaceFlow";
import { useDeleteWorkspaceIntent } from "renderer/stores/delete-workspace-intent";

/**
 * Headless handler for the palette's archive intent. Archiving is instant
 * (undo lives in the toast), so unlike the old delete dialog there is no UI
 * to render — the intent fires the flow and immediately clears.
 */
export function DeleteWorkspaceMount() {
	const target = useDeleteWorkspaceIntent((s) => s.target);
	const close = useDeleteWorkspaceIntent((s) => s.close);
	const { archiveWorkspace } = useArchiveWorkspaceFlow();

	useEffect(() => {
		if (!target) return;
		void archiveWorkspace({
			workspaceId: target.workspaceId,
			source: "command-palette",
		});
		close();
	}, [target, archiveWorkspace, close]);

	return null;
}
