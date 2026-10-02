import type { AppCollections } from "renderer/routes/_authenticated/providers/CollectionsProvider/collections";
import { writeWorkspacePaneLayout } from "./writeWorkspacePaneLayout";

/**
 * Hand a conversation to a workspace that does not exist on screen yet. The
 * chat cannot be opened from here — its pane store belongs to the workspace
 * page, which mounts only once that workspace is navigated to — so the work
 * is queued on the target's local-state row, the same way creation presets
 * are. Ensures the row exists first, mirroring queueWorkspaceCreationPresets.
 */
export function queuePendingChatHandoff(
	collections: AppCollections,
	workspace: { id: string; projectId: string },
	handoff: { agentId: string; prompt: string },
): void {
	if (!collections.v2WorkspaceLocalState.get(workspace.id)) {
		writeWorkspacePaneLayout(collections, workspace, [], []);
	}
	collections.v2WorkspaceLocalState.update(workspace.id, (draft) => {
		draft.pendingChatHandoff = handoff;
	});
}
