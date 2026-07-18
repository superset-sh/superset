import type { WorkspaceState } from "@superset/panes";
import type { PaneViewerData } from "renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/types";
import type {
	AppCollections,
	WorkspaceCreateMutationMetadata,
} from "renderer/routes/_authenticated/providers/CollectionsProvider/collections";
import { appendLaunchesToPaneLayout } from "./appendLaunchesToPaneLayout";

type HostWorkspacesCreateResult = NonNullable<
	WorkspaceCreateMutationMetadata["result"]
>;

/**
 * Insert or update the `v2WorkspaceLocalState` row for a workspace and fold any
 * launched terminals/agents into its pane layout. Called once up-front (with no
 * launches) so the workspace shows in the sidebar while it syncs, then again
 * with the host-service result once the create resolves.
 */
export function writeWorkspacePaneLayout(
	collections: AppCollections,
	workspace: { id: string; projectId: string },
	terminals: HostWorkspacesCreateResult["terminals"],
	agents: HostWorkspacesCreateResult["agents"],
): void {
	const existing = collections.v2WorkspaceLocalState.get(workspace.id);
	const paneLayout = appendLaunchesToPaneLayout({
		existing: existing?.paneLayout as
			| WorkspaceState<PaneViewerData>
			| undefined,
		terminals,
		agents,
	});

	if (existing) {
		collections.v2WorkspaceLocalState.update(workspace.id, (draft) => {
			draft.paneLayout = paneLayout;
		});
		return;
	}

	// Placement is host-owned; this row only carries membership.
	collections.v2WorkspaceLocalState.insert({
		workspaceId: workspace.id,
		createdAt: new Date(),
		sidebarState: {
			projectId: workspace.projectId,
			tabOrder: 0,
			sectionId: null,
			changesFilter: { kind: "all" },
			activeTab: "changes",
			isHidden: false,
		},
		paneLayout,
		viewedFiles: [],
		recentlyViewedFiles: [],
	});
}
