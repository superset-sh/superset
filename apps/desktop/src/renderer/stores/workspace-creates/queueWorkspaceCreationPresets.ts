import type { AppCollections } from "renderer/routes/_authenticated/providers/CollectionsProvider/collections";
import type { V2TerminalPresetRow } from "renderer/routes/_authenticated/providers/CollectionsProvider/dashboardSidebarLocal";
import { getPresetsForTriggerField } from "shared/preset-trigger-selection";
import { writeWorkspacePaneLayout } from "./writeWorkspacePaneLayout";

/**
 * Ids of the presets tagged "auto-run on workspace creation" for a project,
 * in presets-bar order.
 */
export function selectWorkspaceCreationPresetIds(
	presets: readonly V2TerminalPresetRow[],
	projectId: string,
): string[] {
	return getPresetsForTriggerField(
		presets,
		"applyOnWorkspaceCreated",
		projectId,
	)
		.sort((a, b) => a.tabOrder - b.tabOrder)
		.map((preset) => preset.id);
}

/**
 * Queue the project's creation presets on a freshly created workspace's
 * local-state row. Presets are a renderer localStorage collection the host
 * can't read, so they run on the v2 workspace page's first open (see
 * useRunWorkspaceCreationPresets) rather than inside the host's create.
 * Ensures the row exists first, mirroring appendPendingMigratedTerminals.
 */
export function queueWorkspaceCreationPresets(
	collections: AppCollections,
	workspace: { id: string; projectId: string },
): void {
	const presetIds = selectWorkspaceCreationPresetIds(
		Array.from(collections.v2TerminalPresets.state.values()),
		workspace.projectId,
	);
	if (presetIds.length === 0) return;
	if (!collections.v2WorkspaceLocalState.get(workspace.id)) {
		writeWorkspacePaneLayout(collections, workspace, [], []);
	}
	collections.v2WorkspaceLocalState.update(workspace.id, (draft) => {
		draft.pendingCreationPresetIds = presetIds;
	});
}
