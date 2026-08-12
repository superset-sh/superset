import { eq } from "@tanstack/db";
import { useLiveQuery } from "@tanstack/react-db";
import { useDashboardSidebarState } from "renderer/routes/_authenticated/hooks/useDashboardSidebarState";
import { useCollections } from "renderer/routes/_authenticated/providers/CollectionsProvider";
import { useDashboardSidebarSectionRename } from "../../components/DashboardSidebarSectionRenameContext";
import { useDashboardSidebarSelection } from "../../providers/DashboardSidebarSelectionProvider";
import type { DashboardSidebarWorkspace } from "../../types";
import { workspaceIdsForSectionMove } from "../../utils/bulkWorkspaceActions";
import { resolveBulkWorkspaceSectionMenuState } from "./bulkWorkspaceMoveActions";

interface UseBulkWorkspaceMoveActionsOptions {
	projectId: string | null;
	workspacesById: ReadonlyMap<string, DashboardSidebarWorkspace>;
	sectionIdByWorkspaceId: ReadonlyMap<string, string>;
}

/**
 * Provides one cache-first section source and one set of bulk move actions for
 * both the sidebar toolbar and workspace-row context menu.
 */
export function useBulkWorkspaceMoveActions({
	projectId,
	workspacesById,
	sectionIdByWorkspaceId,
}: UseBulkWorkspaceMoveActionsOptions) {
	const collections = useCollections();
	const { createSection, moveWorkspaceToSection } = useDashboardSidebarState();
	const { requestSectionRename } = useDashboardSidebarSectionRename();
	const { clearSelection, selectedWorkspaceIds } =
		useDashboardSidebarSelection();
	const { data: sections, isReady: areSectionsReady } = useLiveQuery(
		(q) =>
			q
				.from({ sidebarSections: collections.v2SidebarSections })
				.where(({ sidebarSections }) =>
					eq(sidebarSections.projectId, projectId ?? ""),
				)
				.orderBy(({ sidebarSections }) => sidebarSections.tabOrder, "asc")
				.select(({ sidebarSections }) => ({
					id: sidebarSections.sectionId,
					name: sidebarSections.name,
					color: sidebarSections.color,
				})),
		[collections, projectId],
	);
	const sectionMenuState = resolveBulkWorkspaceSectionMenuState(
		sections,
		areSectionsReady,
	);
	const selectedWorkspaces = selectedWorkspaceIds.flatMap((workspaceId) => {
		const workspace = workspacesById.get(workspaceId);
		return workspace ? [workspace] : [];
	});
	const selectedIds = selectedWorkspaces.map((workspace) => workspace.id);
	const groupedWorkspaceIds = selectedIds.filter((workspaceId) =>
		sectionIdByWorkspaceId.has(workspaceId),
	);

	const moveSelectionToSection = (sectionId: string) => {
		if (!projectId) return;
		for (const workspaceId of workspaceIdsForSectionMove(
			selectedIds,
			sectionIdByWorkspaceId,
			sectionId,
		)) {
			moveWorkspaceToSection(workspaceId, projectId, sectionId);
		}
		clearSelection();
	};

	const createGroupFromSelection = () => {
		if (!projectId) return;
		const sectionId = createSection(projectId);
		for (const workspaceId of selectedIds) {
			moveWorkspaceToSection(workspaceId, projectId, sectionId);
		}
		clearSelection();
		requestSectionRename(sectionId);
	};

	const ungroupSelection = () => {
		if (!projectId) return;
		for (const workspaceId of groupedWorkspaceIds) {
			moveWorkspaceToSection(workspaceId, projectId, null);
		}
		clearSelection();
	};

	return {
		createGroupFromSelection,
		groupedWorkspaceIds,
		moveSelectionToSection,
		sectionMenuState,
		sections,
		selectedWorkspaces,
		ungroupSelection,
	};
}
