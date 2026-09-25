import type { WorkspaceState } from "@superset/panes";
import type { PaneLifecycleRow } from "renderer/routes/_authenticated/components/utils/paneLifecycleRows";
import type { AppCollections } from "renderer/routes/_authenticated/providers/CollectionsProvider/collections";
import { getPrependTabOrder } from "renderer/routes/_authenticated/providers/CollectionsProvider/dashboardSidebarLocal";

/**
 * Pure sidebar local-state mutations, kept free of React/Electron imports so
 * they can be unit-tested against an in-memory collection. Pane-runtime cleanup
 * is injected so the registry side effects stay in the hook layer.
 */

export function createEmptyPaneLayout(): WorkspaceState<unknown> {
	return {
		version: 1,
		tabs: [],
		activeTabId: null,
	} satisfies WorkspaceState<unknown>;
}

type CleanupPaneRuntimes = (rows: PaneLifecycleRow[]) => void;

/**
 * Hides a single workspace while keeping its project in the sidebar, by leaving
 * a hidden "tombstone" row rather than deleting it. A local `main` workspace
 * with no local-state row is re-surfaced by the gated auto-include path, so
 * hiding one requires a row (`isHidden: true`) to suppress it; a hard-delete
 * would let it reappear.
 */
export function tombstoneSidebarWorkspaceRecord(
	collections: Pick<AppCollections, "workspaceLocalState">,
	workspaceId: string,
	projectId: string | null,
	cleanupPaneRuntimes: CleanupPaneRuntimes,
): void {
	const existing = collections.workspaceLocalState.get(workspaceId);
	if (!existing) {
		collections.workspaceLocalState.insert({
			workspaceId,
			createdAt: new Date(),
			sidebarState: {
				projectId,
				tabOrder: 0,
				sectionId: null,
				isHidden: true,
			},
			paneLayout: createEmptyPaneLayout(),
		});
		return;
	}

	cleanupPaneRuntimes([existing]);
	collections.workspaceLocalState.update(workspaceId, (draft) => {
		draft.sidebarState.projectId = projectId;
		draft.sidebarState.sectionId = null;
		draft.sidebarState.isHidden = true;
		// A row must never be hidden and pinned at once — a resurrected
		// workspace would otherwise reappear pre-pinned.
		draft.sidebarState.pinnedAt = null;
		draft.paneLayout = createEmptyPaneLayout();
	});
}

/**
 * Puts a project in the sidebar. By default a hidden row counts as absent:
 * a deliberate user action on the project (setting it up on this device,
 * opening one of its workspaces) reveals it again, the same way re-adding a
 * removed project used to. Background placement passes `reveal: false`: a
 * workspace created by the CLI or an agent must not undo an explicit hide.
 */
export function ensureSidebarProjectRecord(
	collections: Pick<AppCollections, "sidebarProjects">,
	projectId: string,
	{ reveal = true }: { reveal?: boolean } = {},
): void {
	const existing = collections.sidebarProjects.get(projectId);
	if (existing) {
		if (existing.isHidden && reveal) {
			collections.sidebarProjects.update(projectId, (draft) => {
				draft.isHidden = false;
			});
		}
		return;
	}

	collections.sidebarProjects.insert({
		projectId,
		createdAt: new Date(),
		// Prepend, matching new workspaces: the project you just added is
		// the one you're about to work in.
		tabOrder: getPrependTabOrder([
			...collections.sidebarProjects.state.values(),
		]),
		isCollapsed: false,
		isHidden: false,
	});
}

/**
 * Hides or shows a project without touching its workspaces, sections, pins or
 * order, so a hidden project comes back exactly as it was left. Hiding is the
 * reversible alternative to deleting the project: nothing on any host changes.
 */
export function setSidebarProjectHidden(
	collections: Pick<AppCollections, "sidebarProjects">,
	projectId: string,
	hidden: boolean,
): void {
	if (!collections.sidebarProjects.get(projectId)) return;
	collections.sidebarProjects.update(projectId, (draft) => {
		draft.isHidden = hidden;
	});
}
