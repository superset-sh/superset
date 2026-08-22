import { createEmptyPaneLayout } from "renderer/routes/_authenticated/hooks/useDashboardSidebarState/sidebarMutations";
import type { AppCollections } from "renderer/routes/_authenticated/providers/CollectionsProvider/collections";
import {
	type DashboardSidebarProjectRow,
	type DashboardSidebarSectionRow,
	getNextTabOrder,
	type WorkspaceLocalStateRow,
} from "renderer/routes/_authenticated/providers/CollectionsProvider/dashboardSidebarLocal";

/**
 * Sidebar placement for one project, lifted out of the org it currently sits
 * in. Kept free of React/Electron imports so the copy can be unit-tested
 * against in-memory collections.
 */
export interface ProjectSidebarState {
	project: DashboardSidebarProjectRow | null;
	sections: DashboardSidebarSectionRow[];
	workspaces: WorkspaceLocalStateRow[];
}

type SidebarCollections = Pick<
	AppCollections,
	"v2SidebarProjects" | "v2SidebarSections" | "v2WorkspaceLocalState"
>;

export function collectProjectSidebarState(
	collections: SidebarCollections,
	projectId: string,
): ProjectSidebarState {
	return {
		project: collections.v2SidebarProjects.get(projectId) ?? null,
		sections: Array.from(collections.v2SidebarSections.state.values()).filter(
			(section) => section.projectId === projectId,
		),
		workspaces: Array.from(
			collections.v2WorkspaceLocalState.state.values(),
		).filter((row) => row.sidebarState.projectId === projectId),
	};
}

/**
 * Writes a project's placement into another organization's collections.
 *
 * Ids are preserved throughout — section ids especially, because workspace
 * rows reference their section by id and a fresh id would land every
 * workspace ungrouped on the other side.
 *
 * Two values are org-relative and must be recomputed rather than copied:
 * the project's `tabOrder` (positions it among the target org's projects) and
 * `pinnedAt` (the Pinned section orders by it across the whole org). Hidden
 * tombstones are skipped: they exist to suppress a worktree in the org that
 * dismissed it, and carrying them over would hide it in the new org too.
 *
 * Idempotent — every write checks for an existing row first, so a retried
 * move after a partial failure converges instead of duplicating.
 */
export function applyProjectSidebarState(
	collections: SidebarCollections,
	projectId: string,
	state: ProjectSidebarState,
	/**
	 * Shells to re-open per workspace on the other side, keyed by workspace id.
	 * The PTYs themselves die with the source org's daemon; this queue is the
	 * same one the v1→v2 migration uses to bring terminals back lazily at the
	 * right directory on first open.
	 */
	terminalsToReopen: Map<
		string,
		WorkspaceLocalStateRow["pendingMigratedTerminals"]
	> = new Map(),
): void {
	if (!collections.v2SidebarProjects.get(projectId)) {
		const existingProjects = Array.from(
			collections.v2SidebarProjects.state.values(),
		);
		collections.v2SidebarProjects.insert({
			projectId,
			createdAt: state.project?.createdAt ?? new Date(),
			isCollapsed: state.project?.isCollapsed ?? false,
			tabOrder: getNextTabOrder(existingProjects),
			defaultOpenInApp: state.project?.defaultOpenInApp ?? null,
		});
	}

	for (const section of state.sections) {
		if (collections.v2SidebarSections.get(section.sectionId)) continue;
		collections.v2SidebarSections.insert({ ...section });
	}

	// Pins are re-based onto the target org's scale so a copied workspace
	// doesn't jump ahead of pins that were already there.
	let nextPinnedAt = getNextPinnedAt(collections);
	for (const row of state.workspaces) {
		if (row.sidebarState.isHidden) continue;
		const pinnedAt = row.sidebarState.pinnedAt == null ? null : nextPinnedAt++;
		const existing = collections.v2WorkspaceLocalState.get(row.workspaceId);
		if (!existing) {
			collections.v2WorkspaceLocalState.insert({
				...row,
				// Panes and run-terminals reference PTY sessions owned by the
				// source org's daemon. They cannot be reattached from here, and
				// carrying them over lands the workspace with terminals stuck on
				// "Disconnected" and a Reconnect that can never succeed. Start
				// clean instead — the agent history on disk is keyed by directory,
				// so `claude --resume` still finds it.
				paneLayout: createEmptyPaneLayout(),
				workspaceRunTerminals: {},
				pendingMigratedTerminals: terminalsToReopen.get(row.workspaceId) ?? [],
				sidebarState: { ...row.sidebarState, pinnedAt },
			});
			continue;
		}
		// Moving a project back to an org it came from meets the tombstone the
		// earlier move left behind. The workspace is real and on its way in, so
		// un-hide it — skipping would land the project here with its worktrees
		// silently missing.
		if (existing.sidebarState.isHidden) {
			collections.v2WorkspaceLocalState.update(row.workspaceId, (draft) => {
				draft.paneLayout = createEmptyPaneLayout();
				draft.workspaceRunTerminals = {};
				draft.pendingMigratedTerminals =
					terminalsToReopen.get(row.workspaceId) ?? [];
				draft.sidebarState.projectId = projectId;
				draft.sidebarState.isHidden = false;
				draft.sidebarState.sectionId = row.sidebarState.sectionId;
				draft.sidebarState.tabOrder = row.sidebarState.tabOrder;
				draft.sidebarState.pinnedAt = pinnedAt;
			});
		}
	}
}

function getNextPinnedAt(
	collections: Pick<AppCollections, "v2WorkspaceLocalState">,
): number {
	let maxPinnedAt = 0;
	for (const row of collections.v2WorkspaceLocalState.state.values()) {
		const pinnedAt = row.sidebarState.pinnedAt;
		if (pinnedAt != null && pinnedAt > maxPinnedAt) maxPinnedAt = pinnedAt;
	}
	return Math.max(Date.now(), maxPinnedAt + 1);
}
