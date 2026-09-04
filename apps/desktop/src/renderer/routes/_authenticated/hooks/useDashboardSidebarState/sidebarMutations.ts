import type { WorkspaceState } from "@superset/panes";
import type { HostShapedWorkspace } from "renderer/hooks/host-workspaces/useHostWorkspaces";
import type { PaneLifecycleRow } from "renderer/routes/_authenticated/components/utils/paneLifecycleRows";
import type { AppCollections } from "renderer/routes/_authenticated/providers/CollectionsProvider/collections";

export type SidebarWorkspaceRow = Pick<
	HostShapedWorkspace,
	"id" | "projectId" | "type" | "hostId" | "createdByUserId"
>;

/**
 * Who the sidebar reconciler places for: the local host unconditionally, a
 * remote host only for worktrees this user created. Mirrors
 * `selectWorktreesToPlace` so removal tombstones exactly what placement could
 * bring back.
 */
export type SidebarPlacementScope = {
	machineId: string | null;
	currentUserId: string | null;
};

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
	collections: Pick<AppCollections, "v2WorkspaceLocalState">,
	workspaceId: string,
	projectId: string | null,
	cleanupPaneRuntimes: CleanupPaneRuntimes,
): void {
	const existing = collections.v2WorkspaceLocalState.get(workspaceId);
	if (!existing) {
		collections.v2WorkspaceLocalState.insert({
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
	collections.v2WorkspaceLocalState.update(workspaceId, (draft) => {
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
 * Removes a project from the sidebar. Deleting its `v2SidebarProjects` row is
 * what hides it: membership is explicit and display gates on it
 * (`buildDashboardSidebarProjects` drops any workspace whose project is absent).
 *
 * Worktrees are tombstoned so "removed" stays removed. A worktree with no
 * local-state row would be re-placed by `usePlaceWorktreesInSidebar`
 * (recreating the project), and a kept-but-visible row would flood back the
 * moment anything recreates the project row — e.g. a later automation-created
 * worktree. Hiding each one (existing rows, plus every known row-less worktree
 * the reconciler could re-pin) means a resurrected project shows only the
 * genuinely-new worktree, not these dismissed ones. Row-less worktrees are
 * tombstoned on every host the reconciler could place from — the local host,
 * plus any remote host for worktrees this user created — not just online
 * ones: a host that is offline now would re-place the project the moment it
 * comes back. Teammates' worktrees on a shared host never qualify for
 * placement, so they get no tombstone; on a busy host that would be hundreds
 * of localStorage rows per removal for nothing.
 *
 * `main` workspaces are intentionally left alone: they surface via the gated
 * auto-include path (never re-pinned, never create a project record), so
 * deleting the project row already hides them and re-adding the project brings
 * the main back. Removing a project discards `defaultOpenInApp` (stored on the
 * project row and nowhere else); it resets to default on re-add.
 */
export function removeProjectFromSidebarState(
	collections: Pick<
		AppCollections,
		"v2WorkspaceLocalState" | "v2SidebarSections" | "v2SidebarProjects"
	>,
	workspaces: SidebarWorkspaceRow[],
	projectId: string,
	placement: SidebarPlacementScope,
	cleanupPaneRuntimes: CleanupPaneRuntimes,
): void {
	const mainWorkspaceIds = new Set(
		workspaces
			.filter((ws) => ws.projectId === projectId && ws.type === "main")
			.map((ws) => ws.id),
	);

	const worktreeIds = new Set<string>();
	for (const row of collections.v2WorkspaceLocalState.state.values()) {
		if (
			row.sidebarState.projectId === projectId &&
			!mainWorkspaceIds.has(row.workspaceId)
		) {
			worktreeIds.add(row.workspaceId);
		}
	}
	for (const ws of workspaces) {
		if (ws.projectId !== projectId || ws.type !== "worktree") continue;
		const isLocal =
			placement.machineId !== null && ws.hostId === placement.machineId;
		const isMine =
			placement.currentUserId !== null &&
			ws.createdByUserId === placement.currentUserId;
		if (isLocal || isMine) worktreeIds.add(ws.id);
	}

	for (const workspaceId of worktreeIds) {
		tombstoneSidebarWorkspaceRecord(
			collections,
			workspaceId,
			projectId,
			cleanupPaneRuntimes,
		);
	}

	// Main workspaces keep their rows (see the doc comment above), but any pin
	// must be cleared: a pinned row is excluded from the project tree, and with
	// the project row gone the pinned section drops it too — leaving it fully
	// invisible with no context menu to unpin it from.
	for (const row of collections.v2WorkspaceLocalState.state.values()) {
		if (
			row.sidebarState.projectId === projectId &&
			row.sidebarState.pinnedAt != null
		) {
			collections.v2WorkspaceLocalState.update(row.workspaceId, (draft) => {
				draft.sidebarState.pinnedAt = null;
			});
		}
	}

	const sectionIds = Array.from(collections.v2SidebarSections.state.values())
		.filter((item) => item.projectId === projectId)
		.map((item) => item.sectionId);
	if (sectionIds.length > 0) {
		collections.v2SidebarSections.delete(sectionIds);
	}

	if (collections.v2SidebarProjects.get(projectId)) {
		collections.v2SidebarProjects.delete(projectId);
	}
}
